import { io, type Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

let _socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (_socket?.connected) return _socket;
  _socket?.disconnect();

  _socket = io(`${API_BASE}/notifications`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionAttempts: 5,
  });

  return _socket;
}

export function disconnectSocket() {
  _socket?.disconnect();
  _socket = null;
}
