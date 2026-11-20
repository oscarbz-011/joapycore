'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { tokenStore } from './token-store';
import { getSocket, disconnectSocket } from './socket';
import { WS_EVENT_MAP } from './ws-event-map';
import { publishWsEvent } from './ws-event-bus';
import {
  PERMISSIONS_CHANGED_EVENT,
  permissionsChangeAffects,
} from './permissions-refresh';

interface WsEvent {
  type: string;
  payload: unknown;
}

export function useWsConnection() {
  const { isAuthenticated, jwtPayload, refreshSession } = useAuth();
  const queryClient = useQueryClient();
  const userIdRef = useRef(jwtPayload?.sub);
  const refreshSessionRef = useRef(refreshSession);

  useEffect(() => {
    userIdRef.current = jwtPayload?.sub;
    refreshSessionRef.current = refreshSession;
  }, [jwtPayload?.sub, refreshSession]);

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
      if (
        event.type === PERMISSIONS_CHANGED_EVENT &&
        permissionsChangeAffects(event.payload, userIdRef.current)
      ) {
        // Si la renovación falla, la sesión vencida la resuelve el próximo pedido.
        refreshSessionRef
          .current()
          .then(() => queryClient.invalidateQueries())
          .catch(() => undefined);
        return;
      }
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
