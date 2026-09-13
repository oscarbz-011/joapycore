import { io, type Socket } from 'socket.io-client';

import { API_BASE } from './api/session-refresh';

let _socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (_socket?.connected) return _socket;
  _socket?.disconnect();

  _socket = io(`${API_BASE}/notifications`, {
    auth: { token },
    // Sin forzar 'websocket': si el upgrade a WS falla (proxy, firewall,
    // red poco cooperativa — visto de forma reproducible en este entorno),
    // Socket.IO cae a long-polling en vez de no conectar nunca. Preferimos
    // long-polling con latencia un poco mayor a no recibir actualizaciones
    // en vivo en absoluto.
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
