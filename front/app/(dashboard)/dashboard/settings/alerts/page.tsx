'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CreditCard, Package } from 'lucide-react';
import { alertsApi, type AlertChannel, type AlertConfig, type AlertType } from '../../../../../lib/api/alerts';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Config ────────────────────────────────────────────────────────────────────

const ALERT_META: Record<AlertType, {
  label: string;
  description: string;
  icon: React.ElementType;
  thresholdLabel?: string;
  thresholdUnit?: string;
}> = {
  STOCK_LOW: {
    label: 'Stock bajo',
    description: 'Notifica cuando el stock de un producto cae por debajo del umbral configurado.',
    icon: Package,
    thresholdLabel: 'Unidades mínimas',
    thresholdUnit: 'unidades',
  },
  PAYMENT_DUE: {
    label: 'Pago próximo a vencer',
    description: 'Avisa cuando una cuenta por cobrar vence en los próximos días.',
    icon: CreditCard,
    thresholdLabel: 'Días de anticipación',
    thresholdUnit: 'días',
  },
  INVOICE_OVERDUE: {
    label: 'Factura vencida',
    description: 'Alerta cuando una factura sigue sin pagar X días después de su vencimiento.',
    icon: Bell,
    thresholdLabel: 'Días de gracia',
    thresholdUnit: 'días',
  },
};

const ALL_TYPES: AlertType[] = ['STOCK_LOW', 'PAYMENT_DUE', 'INVOICE_OVERDUE'];

function configForType(configs: AlertConfig[], type: AlertType): AlertConfig | undefined {
  return configs.find((c) => c.type === type);
}

// ── Card ──────────────────────────────────────────────────────────────────────

function AlertCard({ type, config }: { type: AlertType; config?: AlertConfig }) {
  const queryClient = useQueryClient();
  const meta = ALERT_META[type];
  const Icon = meta.icon;
  const isActive = config?.isActive ?? false;

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof alertsApi.upsert>[0]) =>
      alertsApi.upsert(payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  function toggle() {
    mutation.mutate({ type, isActive: !isActive, channel: config?.channel ?? 'SYSTEM', threshold: config?.threshold ?? undefined });
  }

  function setChannel(channel: AlertChannel) {
    mutation.mutate({ type, channel, isActive: config?.isActive ?? true, threshold: config?.threshold ?? undefined });
  }

  function setThreshold(value: string) {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n > 0) {
      mutation.mutate({ type, threshold: n, isActive: config?.isActive ?? true, channel: config?.channel ?? 'SYSTEM' });
    }
  }

  const inputCls = 'rounded-lg border border-border bg-card text-foreground px-3 py-1.5 text-sm focus:border-ring focus:outline-none w-28';

  return (
    <div className={`rounded-xl border bg-card p-5 transition-opacity ${!isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/30">
            <Icon size={18} className="text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">{meta.label}</p>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-sm">{meta.description}</p>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={toggle}
          disabled={mutation.isPending}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
            isActive ? 'bg-primary' : 'bg-muted/50'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition duration-200 ${
              isActive ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {isActive && (
        <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-4">
          {meta.thresholdLabel && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{meta.thresholdLabel}</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  defaultValue={config?.threshold ?? 5}
                  onBlur={(e) => setThreshold(e.target.value)}
                />
                <span className="text-sm text-muted-foreground/60">{meta.thresholdUnit}</span>
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Canal</p>
            <Select value={config?.channel ?? 'SYSTEM'} onValueChange={(v) => v && setChannel(v as AlertChannel)}>
              <SelectTrigger>
                <span className="flex-1 text-left text-sm truncate">{(config?.channel ?? 'SYSTEM') === 'EMAIL' ? 'Email' : 'Sistema'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SYSTEM">Sistema</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: alertsApi.getConfigs,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Alertas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configurá qué eventos generan notificaciones en tu empresa
        </p>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando configuración…</div>
      ) : (
        <div className="space-y-4 max-w-2xl">
          {ALL_TYPES.map((type) => (
            <AlertCard key={type} type={type} config={configForType(configs, type)} />
          ))}
        </div>
      )}
    </div>
  );
}
