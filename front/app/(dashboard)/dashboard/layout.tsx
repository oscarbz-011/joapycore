'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Moon, Sun, Mail } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { useTheme } from '../../../lib/theme-context';
import { useWsConnection } from '../../../lib/use-ws-connection';
import { Sidebar } from './components/sidebar';
import { AlertsDropdown } from './components/alerts-dropdown';
import { SearchModal } from './components/search-modal';
import { UserMenu } from './components/user-menu';

const PROFILE_PATH = '/dashboard/settings/profile';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  useWsConnection();
  const router = useRouter();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
          <div style={{ flex: 1 }} />

          {/* Search icon */}
          <button
            onClick={() => setSearchOpen(true)}
            title="Buscar (⌘K)"
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
            <Search size={16} />
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

          {/* Mail */}
          <button
            onClick={() => router.push('/dashboard/billing')}
            title="Facturación"
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
            <Mail size={16} />
          </button>

          {/* Alerts dropdown */}
          <AlertsDropdown />

          {/* User menu */}
          <UserMenu />
        </header>

        {/* ── Content ─────────────────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '26px 30px 40px' }}>
            {children}
          </div>
        </main>
      </div>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
