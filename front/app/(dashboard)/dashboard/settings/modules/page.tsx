'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  Package,
  FileText,
  CreditCard,
  Truck,
  Users,
} from 'lucide-react';
import { tenantsApi } from '../../../../../lib/api/tenants';
import { useAuth } from '../../../../../lib/auth-context';

const MODULE_META: Record<string, { label: string; description: string; icon: React.ElementType }> = {
  sales:       { label: 'Ventas',           icon: ShoppingCart, description: 'Pedidos, presupuestos y gestión de clientes' },
  inventory:   { label: 'Inventario',       icon: Package,      description: 'Productos, stock y movimientos de almacén' },
  billing:     { label: 'Facturación',      icon: FileText,     description: 'Emisión y administración de facturas' },
  payments:    { label: 'Pagos',            icon: CreditCard,   description: 'Cuentas por cobrar y cuentas por pagar' },
  procurement: { label: 'Compras',          icon: Truck,        description: 'Órdenes de compra y gestión de proveedores' },
  hr:          { label: 'Recursos Humanos', icon: Users,        description: 'Empleados, licencias y procesamiento de nómina' },
};

export default function ModulesPage() {
  const queryClient = useQueryClient();
  const { jwtPayload, refreshSession } = useAuth();
  const canToggle = jwtPayload?.permissions.includes('tenants:modules:manage') ?? false;

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['tenant-modules'],
    queryFn: tenantsApi.listModules,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ moduleName, active }: { moduleName: string; active: boolean }) =>
      tenantsApi.toggleModule(moduleName, active),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['tenant-modules'], updated);
      await refreshSession();
    },
  });

  if (isLoading) {
    return <div className="text-sm text-slate-500">Cargando módulos...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Módulos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Activá o desactivá los módulos disponibles para tu empresa.
        </p>
      </div>

      <div className="space-y-3">
        {modules.map((mod) => {
          const meta = MODULE_META[mod.moduleName];
          if (!meta) return null;
          const Icon = meta.icon;
          const isPending =
            toggleMutation.isPending &&
            (toggleMutation.variables as { moduleName: string } | undefined)?.moduleName === mod.moduleName;

          return (
            <div
              key={mod.id}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <Icon size={18} className="text-slate-600" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{meta.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    mod.active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {mod.active ? 'Activo' : 'Inactivo'}
                </span>

                {canToggle && (
                  <button
                    onClick={() =>
                      toggleMutation.mutate({ moduleName: mod.moduleName, active: !mod.active })
                    }
                    disabled={isPending}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                      mod.active ? 'bg-slate-900' : 'bg-slate-200'
                    }`}
                    role="switch"
                    aria-checked={mod.active}
                    aria-label={`${mod.active ? 'Desactivar' : 'Activar'} ${meta.label}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
                        mod.active ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!canToggle && (
        <p className="text-xs text-slate-400 text-center">
          Necesitás el permiso <span className="font-mono">tenants:modules:manage</span> para modificar los módulos.
        </p>
      )}
    </div>
  );
}
