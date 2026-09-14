'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { checkRouteAccess } from '@/lib/route-access';
import { useActiveModules } from '@/lib/use-active-modules';

// Corta pantallas de módulos inactivos o sin permiso antes de que dispare sus
// requests (que responderían 403). Ver lib/route-access.ts.
export function RouteAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { jwtPayload } = useAuth();
  const { activeModules } = useActiveModules();

  const access = checkRouteAccess(pathname, activeModules, jwtPayload?.permissions ?? []);
  if (access.allowed) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <Lock size={22} className="mx-auto text-muted-foreground/50" />
      <h1 className="mt-3 text-base font-semibold text-foreground">
        {access.reason === 'module' ? 'Módulo no activo' : 'Sin acceso a esta sección'}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {access.reason === 'module'
          ? 'Esta sección pertenece a un módulo que no está activo para tu empresa. Un administrador puede activarlo en Sistema → Módulos.'
          : 'Tu usuario no tiene los permisos necesarios. Pedile a un administrador que los asigne a tu rol.'}
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-block text-sm font-medium text-foreground underline underline-offset-2"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
