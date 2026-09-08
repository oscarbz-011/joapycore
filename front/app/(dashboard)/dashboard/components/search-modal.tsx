'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X, Package, User,
  LayoutDashboard, ShoppingCart, FileText,
  CreditCard, Truck, Users, Settings, Target, Loader2,
} from 'lucide-react';
import { inventoryApi, type Product } from '../../../../lib/api/inventory';
import { salesApi, type Customer } from '../../../../lib/api/sales';
import { cn } from '@/lib/utils';

// ── Module quick links ─────────────────────────────────────────────────────────

const MODULE_LINKS = [
  { icon: LayoutDashboard, label: 'Dashboard',    href: '/dashboard' },
  { icon: ShoppingCart,    label: 'Ventas',        href: '/dashboard/sales' },
  { icon: Target,          label: 'Metas',         href: '/dashboard/sales/targets' },
  { icon: Package,         label: 'Inventario',    href: '/dashboard/inventory' },
  { icon: FileText,        label: 'Facturación',   href: '/dashboard/billing' },
  { icon: CreditCard,      label: 'Pagos',         href: '/dashboard/payments' },
  { icon: Truck,           label: 'Compras',       href: '/dashboard/procurement' },
  { icon: Users,           label: 'RRHH',          href: '/dashboard/hr' },
  { icon: Settings,        label: 'Configuración', href: '/dashboard/settings' },
];

const MAX_PER_SECTION = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}

function customerFullName(c: Customer) {
  return [c.firstName, c.secondFirstName, c.lastName, c.secondLastName]
    .filter(Boolean).join(' ');
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="px-2.5 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60">
      {label}
    </p>
  );
}

function ResultRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  sub,
  right,
  onClick,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  sub?: string;
  right?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-muted/20"
    >
      <span
        className={cn('flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg', iconBg, iconColor)}
      >
        <Icon size={14} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[13.5px] font-medium text-foreground">{label}</span>
        {sub && <span className="block truncate text-[11.5px] text-muted-foreground/60">{sub}</span>}
      </span>
      {right && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{right}</span>
      )}
    </button>
  );
}

// ── SearchModal ────────────────────────────────────────────────────────────────

export function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Focus on mount + Esc to close
  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounce input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch on debounced query
  useEffect(() => {
    if (!debouncedQuery) {
      setProducts([]);
      setCustomers([]);
      return;
    }
    setLoading(true);

    Promise.allSettled([
      inventoryApi.listProducts({ search: debouncedQuery }),
      salesApi.listCustomers(),
    ]).then(([prodsResult, custsResult]) => {
      setProducts(
        prodsResult.status === 'fulfilled' ? prodsResult.value.slice(0, MAX_PER_SECTION) : [],
      );
      const q = debouncedQuery.toLowerCase();
      const allCustomers = custsResult.status === 'fulfilled' ? custsResult.value : [];
      setCustomers(
        allCustomers
          .filter((c) =>
            `${c.firstName} ${c.lastName} ${c.documentNumber ?? ''}`.toLowerCase().includes(q),
          )
          .slice(0, MAX_PER_SECTION),
      );
    }).finally(() => setLoading(false));
  }, [debouncedQuery]);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  const filteredModules = debouncedQuery
    ? MODULE_LINKS.filter((l) => l.label.toLowerCase().includes(debouncedQuery.toLowerCase()))
    : MODULE_LINKS;

  const hasQuery = debouncedQuery.length > 0;
  const hasResults = products.length > 0 || customers.length > 0 || filteredModules.length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/45 pt-[72px] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="animate-rise-in flex w-[540px] max-h-[calc(100vh-120px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Input ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3.5">
          {loading
            ? <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
            : <Search size={16} className="shrink-0 text-muted-foreground/60" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos, clientes, módulos…"
            className="flex-1 border-none bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-muted/30 text-muted-foreground hover:bg-muted/50"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* ── Results ── */}
        <div className="flex-1 overflow-y-auto">

          {/* No query → module quick access grid */}
          {!hasQuery && (
            <div className="px-2.5 py-3">
              <p className="px-1.5 pb-2 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground/60">
                Acceso rápido
              </p>
              <div className="grid grid-cols-3 gap-0.5">
                {MODULE_LINKS.map(({ icon: Icon, label, href }) => (
                  <button
                    key={href}
                    onClick={() => navigate(href)}
                    className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted/20"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-accent-subtle text-accent-on">
                      <Icon size={14} />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* With query → grouped results */}
          {hasQuery && !loading && !hasResults && (
            <p className="px-5 py-8 text-center text-[13.5px] text-muted-foreground/60">
              Sin resultados para &ldquo;{debouncedQuery}&rdquo;
            </p>
          )}

          {/* Módulos */}
          {hasQuery && filteredModules.length > 0 && (
            <div className="px-1.5">
              <SectionHeader label="Módulos" />
              {filteredModules.map(({ icon: Icon, label, href }) => (
                <ResultRow
                  key={href}
                  icon={Icon}
                  iconBg="bg-accent-subtle"
                  iconColor="text-accent-on"
                  label={label}
                  onClick={() => navigate(href)}
                />
              ))}
            </div>
          )}

          {/* Productos */}
          {hasQuery && products.length > 0 && (
            <div className="px-1.5">
              <SectionHeader label="Productos" />
              {products.map((p) => (
                <ResultRow
                  key={p.id}
                  icon={Package}
                  iconBg="bg-blue-100 dark:bg-blue-950"
                  iconColor="text-blue-600 dark:text-blue-400"
                  label={p.name + (p.model ? ` — ${p.model}` : '')}
                  sub={[p.category?.name, p.brand?.name].filter(Boolean).join(' · ')}
                  right={p.salePrice == null ? 'Pendiente' : fmtGs(p.salePrice)}
                  onClick={() => navigate('/dashboard/inventory')}
                />
              ))}
            </div>
          )}

          {/* Clientes */}
          {hasQuery && customers.length > 0 && (
            <div className="px-1.5">
              <SectionHeader label="Clientes" />
              {customers.map((c) => (
                <ResultRow
                  key={c.id}
                  icon={User}
                  iconBg="bg-violet-100 dark:bg-violet-950"
                  iconColor="text-violet-600 dark:text-violet-400"
                  label={customerFullName(c)}
                  sub={c.documentNumber ?? c.email ?? undefined}
                  onClick={() => navigate('/dashboard/sales/customers')}
                />
              ))}
            </div>
          )}

          {hasQuery && <div className="h-2" />}
        </div>

        {/* ── Hint bar ── */}
        <div className="flex shrink-0 gap-3.5 border-t border-border px-4 py-2">
          {[['↵', 'Seleccionar'], ['Esc', 'Cerrar']].map(([key, desc]) => (
            <span key={key} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/60">
              <kbd className="rounded border border-border px-1.5 py-px text-[11px] text-muted-foreground">
                {key}
              </kbd>
              {desc}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
