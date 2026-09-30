import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const blockedDestinations = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedDestinations.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['100::', 64],
  ['2001:2::', 48],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedDestinations.addSubnet(network, prefix, 'ipv6');
}

function isBlocked(address: string, family: 4 | 6) {
  return blockedDestinations.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function supportedFamily(family: number): 4 | 6 {
  if (family === 4 || family === 6) return family;
  return rejectUnsafeDestination();
}

function rejectUnsafeDestination(): never {
  throw new Error('El servidor debe resolver únicamente a un destino público');
}

export interface PublicNetworkDestination {
  address: string;
  family: 4 | 6;
  servername?: string;
}

export async function resolvePublicNetworkDestination(
  host: string,
): Promise<PublicNetworkDestination> {
  const normalizedHost = host.trim().toLowerCase();
  const literalFamily = isIP(normalizedHost);
  if (literalFamily) {
    const family = supportedFamily(literalFamily);
    if (isBlocked(normalizedHost, family)) rejectUnsafeDestination();
    return { address: normalizedHost, family };
  }

  const addresses = await lookup(normalizedHost, {
    all: true,
    verbatim: true,
  });
  const destinations = addresses.map(({ address, family }) => ({
    address,
    family: supportedFamily(family),
  }));
  if (
    destinations.length === 0 ||
    destinations.some(({ address, family }) => isBlocked(address, family))
  ) {
    rejectUnsafeDestination();
  }
  return { ...destinations[0], servername: normalizedHost };
}
