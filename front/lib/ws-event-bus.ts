export interface WsEvent {
  type: string;
  payload: unknown;
}

type Listener = (event: WsEvent) => void;

const listeners = new Set<Listener>();

// Pub/sub liviano para que otros consumidores (ej. los toasts de
// pending-item-toasts.tsx) reaccionen a los eventos de WebSocket sin abrir
// una segunda conexión — front/lib/use-ws-connection.ts sigue siendo el
// único dueño del socket (front/lib/socket.ts es un singleton que solo
// reutiliza la conexión existente si ya está `connected`; llamar getSocket()
// desde dos lugares distintos antes de que la primera conexión termine de
// establecerse crea una conexión duplicada).
export function publishWsEvent(event: WsEvent) {
  listeners.forEach((listener) => listener(event));
}

export function subscribeWsEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
