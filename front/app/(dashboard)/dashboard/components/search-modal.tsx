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
    <p style={{
      fontSize: '11px', fontWeight: 700, color: 'var(--faint)',
      textTransform: 'uppercase', letterSpacing: '0.07em',
      padding: '12px 10px 6px',
    }}>
      {label}
    </p>
  );
}

function ResultRow({
  icon: Icon,
  iconColor,
  label,
  sub,
  right,
  onClick,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  sub?: string;
  right?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        width: '100%', padding: '8px 10px',
        border: 'none', borderRadius: '9px',
        background: 'transparent', cursor: 'pointer',
        textAlign: 'left', transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--panel-2)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{
        width: '30px', height: '30px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '8px', background: iconColor + '18',
        color: iconColor,
      }}>
        <Icon size={14} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: '13.5px', color: 'var(--ink)',
          fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        {sub && (
          <span style={{
            display: 'block', fontSize: '11.5px', color: 'var(--faint)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {sub}
          </span>
        )}
      </span>
      {right && (
        <span style={{ fontSize: '12px', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {right}
        </span>
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

    // ── Add more entity searches here as the product grows ──
    Promise.allSettled([
      inventoryApi.listProducts({ search: debouncedQuery }),
      salesApi.listCustomers({ search: debouncedQuery }),
    ]).then(([prodsResult, custsResult]) => {
      setProducts(
        prodsResult.status === 'fulfilled' ? prodsResult.value.slice(0, MAX_PER_SECTION) : [],
      );
      setCustomers(
        custsResult.status === 'fulfilled' ? custsResult.value.slice(0, MAX_PER_SECTION) : [],
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
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '72px',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        className="animate-rise-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '540px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          maxHeight: 'calc(100vh - 120px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Input ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {loading
            ? <Loader2 size={16} style={{ color: 'var(--accent)', flexShrink: 0, animation: 'spin 0.7s linear infinite' }} />
            : <Search size={16} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar productos, clientes, módulos…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent',
              fontSize: '15px', color: 'var(--ink)',
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                width: '26px', height: '26px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', borderRadius: '7px',
                background: 'var(--panel-2)', color: 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* ── Results ── */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* No query → module quick access grid */}
          {!hasQuery && (
            <div style={{ padding: '10px 10px 14px' }}>
              <p style={{
                fontSize: '11px', fontWeight: 700, color: 'var(--faint)',
                textTransform: 'uppercase', letterSpacing: '0.07em',
                padding: '0 6px 8px',
              }}>
                Acceso rápido
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '3px' }}>
                {MODULE_LINKS.map(({ icon: Icon, label, href }) => (
                  <button
                    key={href}
                    onClick={() => navigate(href)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '9px',
                      padding: '9px 10px',
                      border: 'none', borderRadius: '9px',
                      background: 'transparent', color: 'var(--ink)',
                      fontSize: '13px', fontFamily: 'inherit',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--panel-2)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span style={{
                      width: '28px', height: '28px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '7px', background: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                    }}>
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
            <p style={{ fontSize: '13.5px', color: 'var(--faint)', textAlign: 'center', padding: '32px 20px' }}>
              Sin resultados para &ldquo;{debouncedQuery}&rdquo;
            </p>
          )}

          {/* Módulos */}
          {hasQuery && filteredModules.length > 0 && (
            <div style={{ padding: '0 6px' }}>
              <SectionHeader label="Módulos" />
              {filteredModules.map(({ icon: Icon, label, href }) => (
                <ResultRow
                  key={href}
                  icon={Icon}
                  iconColor="var(--accent)"
                  label={label}
                  onClick={() => navigate(href)}
                />
              ))}
            </div>
          )}

          {/* Productos */}
          {hasQuery && products.length > 0 && (
            <div style={{ padding: '0 6px' }}>
              <SectionHeader label="Productos" />
              {products.map((p) => (
                <ResultRow
                  key={p.id}
                  icon={Package}
                  iconColor="#60a5fa"
                  label={p.name + (p.model ? ` — ${p.model}` : '')}
                  sub={[p.category?.name, p.brand?.name].filter(Boolean).join(' · ')}
                  right={fmtGs(p.salePrice)}
                  onClick={() => navigate('/dashboard/inventory')}
                />
              ))}
            </div>
          )}

          {/* Clientes */}
          {hasQuery && customers.length > 0 && (
            <div style={{ padding: '0 6px' }}>
              <SectionHeader label="Clientes" />
              {customers.map((c) => (
                <ResultRow
                  key={c.id}
                  icon={User}
                  iconColor="#a78bfa"
                  label={customerFullName(c)}
                  sub={c.documentNumber ?? c.email ?? undefined}
                  onClick={() => navigate('/dashboard/sales/customers')}
                />
              ))}
            </div>
          )}

          {/* Bottom padding */}
          {hasQuery && <div style={{ height: '8px' }} />}
        </div>

        {/* ── Hint bar ── */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '8px 16px',
          display: 'flex', gap: '14px',
          flexShrink: 0,
        }}>
          {[['↵', 'Seleccionar'], ['Esc', 'Cerrar']].map(([key, desc]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: 'var(--faint)' }}>
              <kbd style={{
                padding: '1px 5px', borderRadius: '4px',
                border: '1px solid var(--border-strong)',
                fontSize: '11px', color: 'var(--muted)',
              }}>{key}</kbd>
              {desc}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
