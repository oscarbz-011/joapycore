'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Plus, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { useTheme } from '../../../lib/theme-context';
import { Sidebar } from './components/sidebar';
import { AlertsDropdown } from './components/alerts-dropdown';

const PROFILE_PATH = '/dashboard/settings/profile';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) { router.push('/login'); return; }
    if (mustChangePassword && pathname !== PROFILE_PATH) { router.push(PROFILE_PATH); }
  }, [isLoading, isAuthenticated, mustChangePassword, pathname, router]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-border-strong" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar />

      {/* Main column */}
      <div style={{ marginLeft: '250px', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header style={{
          height: '58px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: '14px',
          padding: '0 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel)',
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            height: '36px', padding: '0 12px',
            flex: 1, maxWidth: '420px',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: '9px',
            color: 'var(--faint)',
          }}>
            <Search size={14} style={{ flexShrink: 0 }} />
            <input
              placeholder="Buscar productos, clientes, facturas…"
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                flex: 1, fontSize: '13.5px', color: 'var(--ink)',
                fontFamily: 'inherit',
              }}
            />
            <span style={{
              fontSize: '11px', border: '1px solid var(--border-strong)',
              borderRadius: '5px', padding: '1px 6px', color: 'var(--faint)',
            }}>⌘K</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Nueva venta CTA */}
          <button
            onClick={() => router.push('/dashboard/sales')}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              height: '36px', padding: '0 14px',
              border: 'none', borderRadius: '9px',
              background: 'var(--accent)', color: '#fff',
              fontWeight: 600, fontSize: '13.5px',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-strong)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; }}
          >
            <Plus size={14} />
            Nueva venta
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            style={{
              width: '36px', height: '36px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)', borderRadius: '9px',
              background: 'var(--panel-2)', color: 'var(--muted)',
              cursor: 'pointer', transition: 'color 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Alerts dropdown */}
          <AlertsDropdown />
        </header>

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '26px 30px 40px' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
