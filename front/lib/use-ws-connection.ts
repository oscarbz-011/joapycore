'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { tokenStore } from './token-store';
import { getSocket, disconnectSocket } from './socket';
import { WS_EVENT_MAP } from './ws-event-map';
import { publishWsEvent } from './ws-event-bus';

interface WsEvent {
  type: string;
  payload: unknown;
}

export function useWsConnection() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }

    const token = tokenStore.getAccessToken();
    if (!token) return;

    const socket = getSocket(token);

    const handler = (event: WsEvent) => {
      publishWsEvent(event);
      const keys = WS_EVENT_MAP[event.type];
      if (!keys) return;
      keys.forEach((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      );
    };

    socket.on('ws-event', handler);
    return () => {
      socket.off('ws-event', handler);
    };
  }, [isAuthenticated, queryClient]);
}
