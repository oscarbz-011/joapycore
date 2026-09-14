'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Mail } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { useWsConnection } from '../../../lib/use-ws-connection';
import { Button } from '@/components/ui/button';
import { Sidebar } from './components/sidebar';
import { AlertsDropdown } from './components/alerts-dropdown';
import { SearchModal } from './components/search-modal';
import { UserMenu } from './components/user-menu';
import { ThemeToggle } from './components/theme-toggle';
import { ForcePasswordModal } from './components/force-password-modal';
import { PendingItemToasts } from './components/pending-item-toasts';
import { RouteAccessGuard } from './components/route-access-guard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  useWsConnection();
  const router = useRouter();
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
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="ml-[250px] flex flex-1 flex-col min-w-0">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="h-[58px] shrink-0 flex items-center gap-1.5 px-6 border-b border-border bg-card sticky top-0 z-30">
          <div className="flex-1" />

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setSearchOpen(true)}
            title="Buscar (⌘K)"
            className="text-muted-foreground"
          >
            <Search size={15} />
          </Button>

          <ThemeToggle />

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => router.push('/dashboard/billing')}
            title="Facturación"
            className="text-muted-foreground"
          >
            <Mail size={15} />
          </Button>

          <AlertsDropdown />
          <UserMenu />
        </header>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-8 pt-7 pb-12">
            <RouteAccessGuard>{children}</RouteAccessGuard>
          </div>
        </main>
      </div>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {mustChangePassword && <ForcePasswordModal />}
      <PendingItemToasts />
    </div>
  );
}
