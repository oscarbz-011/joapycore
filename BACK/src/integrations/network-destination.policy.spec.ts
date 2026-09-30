import { lookup } from 'node:dns/promises';
import { resolvePublicNetworkDestination } from './network-destination.policy';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

describe('network destination policy', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    '127.0.0.1',
    '10.0.0.8',
    '169.254.169.254',
    '192.168.1.20',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('rejects a private or local IP literal: %s', async (host) => {
    await expect(resolvePublicNetworkDestination(host)).rejects.toThrow(
      'destino público',
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a hostname when any DNS answer is private', async () => {
    jest.mocked(lookup).mockResolvedValue([
      { address: '203.0.113.10', family: 4 },
      { address: '10.10.0.4', family: 4 },
    ] as never);

    await expect(
      resolvePublicNetworkDestination('smtp.example.com'),
    ).rejects.toThrow('destino público');
  });

  it('accepts a hostname only when every DNS answer is public', async () => {
    jest.mocked(lookup).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ] as never);

    await expect(
      resolvePublicNetworkDestination('smtp.example.com'),
    ).resolves.toEqual({
      address: '8.8.8.8',
      family: 4,
      servername: 'smtp.example.com',
    });
    expect(lookup).toHaveBeenCalledWith('smtp.example.com', {
      all: true,
      verbatim: true,
    });
  });
});
