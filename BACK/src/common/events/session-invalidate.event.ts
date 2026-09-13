// Pide descartar el estado de sesión cacheado (activo, empresa activa,
// permisos) para que un cambio de seguridad se aplique en el próximo request.
// Lo escucha SessionStateCache (auth); lo emiten users, roles y RRHH.
export const SESSION_INVALIDATE_EVENT = 'auth.session.invalidate';

/** Un usuario puntual o todos los de un tenant. */
export interface SessionInvalidateEvent {
  userId?: string;
  tenantId?: string;
}
