'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Settings, LogOut, UserCog } from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';

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
  const lastName  = user?.lastName ?? '';
  const fullName  = ([firstName, lastName].filter(Boolean).join(' ')) || (jwtPayload?.email?.split('@')[0] ?? 'Usuario');
  const email     = user?.email ?? jwtPayload?.email ?? '';
  const role      = jwtPayload?.roles?.[0] ?? '';
  const initials  = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`
    : email ? email[0].toUpperCase()
    : 'U';

  async function handleLogout() {
    setOpen(false);
    await logout();
    router.push('/login');
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px',
    width: '100%', padding: '9px 10px',
    border: 'none', borderRadius: '8px',
    background: 'transparent', color: 'var(--ink)',
    fontSize: '13.5px', fontFamily: 'inherit',
    cursor: 'pointer', textAlign: 'left',
    transition: 'background 0.1s',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={fullName}
        style={{
          width: '34px', height: '34px', borderRadius: '50%',
          background: 'var(--accent)', color: '#fff',
          fontWeight: 700, fontSize: '13px', letterSpacing: '0.02em',
          border: open ? '2px solid var(--accent-strong)' : '2px solid transparent',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.12s',
          flexShrink: 0,
        }}
      >
        {initials}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="animate-rise-in"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: '230px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          {/* User info */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px',
            }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '13px',
              }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {fullName}
                </p>
                {role && (
                  <p style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '1px' }}>{role}</p>
                )}
              </div>
            </div>
            {email && (
              <p style={{ fontSize: '11.5px', color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email}
              </p>
            )}
          </div>

          {/* Nav items */}
          <div style={{ padding: '6px' }}>
            {([
              { icon: User,    label: 'Ver perfil',      href: '/dashboard/settings/profile' },
              { icon: UserCog, label: 'Editar perfil',   href: '/dashboard/settings/profile' },
              { icon: Settings, label: 'Configuración',  href: '/dashboard/settings' },
            ] as { icon: React.ElementType; label: string; href: string }[]).map(({ icon: Icon, label, href }) => (
              <button
                key={label}
                onClick={() => { setOpen(false); router.push(href); }}
                style={btnStyle}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--panel-2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Icon size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                {label}
              </button>
            ))}
          </div>

          {/* Logout */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '6px' }}>
            <button
              onClick={handleLogout}
              style={{ ...btnStyle, color: 'var(--danger)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--danger-soft)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <LogOut size={15} style={{ flexShrink: 0 }} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
