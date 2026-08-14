'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Settings, LogOut, UserCog } from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const { user, jwtPayload, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const firstName = user?.firstName ?? '';
  const lastName  = user?.lastName  ?? '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || (jwtPayload?.email?.split('@')[0] ?? 'Usuario');
  const email     = user?.email ?? jwtPayload?.email ?? '';
  const role      = jwtPayload?.roles?.[0] ?? '';
  const initials  = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`
    : email ? email[0].toUpperCase() : 'U';

  async function handleLogout() {
    setOpen(false);
    await logout();
    router.push('/login');
  }

  const NAV_ITEMS = [
    { icon: User,     label: 'Ver perfil',    href: '/dashboard/settings/profile' },
    { icon: UserCog,  label: 'Editar perfil', href: '/dashboard/settings/profile' },
    { icon: Settings, label: 'Configuración', href: '/dashboard/settings' },
  ] as const;

  return (
    <div ref={ref} className="relative">
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={fullName}
        className={cn(
          'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full',
          'bg-primary text-primary-foreground text-[13px] font-bold tracking-wide',
          'border-2 transition-colors',
          open ? 'border-primary/60' : 'border-transparent hover:border-primary/40',
        )}
      >
        {initials}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="animate-rise-in absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          {/* User info */}
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[13px] font-bold">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-foreground">{fullName}</p>
                {role && <p className="text-[11.5px] text-muted-foreground mt-px">{role}</p>}
              </div>
            </div>
            {email && (
              <p className="truncate text-[11.5px] text-muted-foreground/70">{email}</p>
            )}
          </div>

          <Separator />

          <div className="p-1.5">
            {NAV_ITEMS.map(({ icon: Icon, label, href }) => (
              <button
                key={label}
                onClick={() => { setOpen(false); router.push(href); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-foreground transition-colors hover:bg-muted cursor-pointer border-0 bg-transparent font-[inherit]"
              >
                <Icon size={14} className="shrink-0 text-muted-foreground" />
                {label}
              </button>
            ))}
          </div>

          <Separator />

          <div className="p-1.5">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-destructive transition-colors hover:bg-destructive/10 cursor-pointer border-0 bg-transparent font-[inherit]"
            >
              <LogOut size={14} className="shrink-0" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
