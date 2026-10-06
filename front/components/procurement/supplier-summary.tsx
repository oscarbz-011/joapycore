import type { ElementType, ReactNode } from 'react';
import {
  Boxes,
  CalendarClock,
  FileText,
  Mail,
  MapPin,
  PackageCheck,
  Percent,
  Phone,
  Timer,
  Truck,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { Supplier } from '@/lib/api/procurement';
import {
  quantityDiscountsSummary,
  volumeDiscountsSummary,
} from '@/lib/commercial-terms';
import { leadTimeLabel, paymentTermLabel, supplierInitials } from '@/lib/suppliers';

const gs = (n: number) => 'Gs. ' + new Intl.NumberFormat('es-PY').format(n);

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: ElementType;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{children}</dd>
      </div>
    </div>
  );
}

const EMPTY = <span className="font-normal text-muted-foreground">Sin cargar</span>;

/** Ficha del proveedor: identidad arriba, datos de contacto y pago en grilla. */
export function SupplierSummary({
  supplier,
  actions,
}: {
  supplier: Supplier;
  actions?: ReactNode;
}) {
  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-base font-bold text-primary"
          >
            {supplierInitials(supplier.name)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground">
              {supplier.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={supplier.isActive ? 'secondary' : 'outline'}>
                {supplier.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
              {supplier.isImporter && <Badge variant="secondary">Importador</Badge>}
            </div>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <dl className="grid gap-x-6 gap-y-5 border-t border-border p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field icon={User} label="Contacto">
          {supplier.contactName ?? EMPTY}
        </Field>
        <Field icon={Mail} label="Email">
          {supplier.email ? (
            <a href={`mailto:${supplier.email}`} className="hover:underline">
              {supplier.email}
            </a>
          ) : (
            EMPTY
          )}
        </Field>
        <Field icon={Phone} label="Teléfono">
          {supplier.phone ? (
            <a href={`tel:${supplier.phone.replace(/\s+/g, '')}`} className="hover:underline">
              {supplier.phone}
            </a>
          ) : (
            EMPTY
          )}
        </Field>
        <Field icon={FileText} label="RUC">
          {supplier.taxId ? <span className="tabular-nums">{supplier.taxId}</span> : EMPTY}
        </Field>
        <Field icon={MapPin} label="Dirección">
          {supplier.address ?? EMPTY}
        </Field>
        <Field icon={CalendarClock} label="Plazo de pago">
          {paymentTermLabel(supplier.paymentTermDays)}
        </Field>
      </dl>

      <dl className="grid gap-x-6 gap-y-5 border-t border-border p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field icon={Truck} label="Costo de envío">
          {supplier.shippingCost === null
            ? EMPTY
            : supplier.shippingCost === 0
              ? 'Sin cargo'
              : gs(supplier.shippingCost)}
        </Field>
        <Field icon={Timer} label="Plazo de entrega">
          {supplier.leadTimeDays === null ? EMPTY : leadTimeLabel(supplier.leadTimeDays)}
        </Field>
        <Field icon={PackageCheck} label="Pedido mínimo">
          {supplier.minOrderAmount === null
            ? EMPTY
            : supplier.minOrderAmount === 0
              ? 'Sin mínimo'
              : gs(supplier.minOrderAmount)}
        </Field>
      </dl>

      <dl className="grid gap-x-6 gap-y-5 border-t border-border p-5 sm:grid-cols-2">
        <Field icon={Percent} label="Descuento por total de la orden">
          {volumeDiscountsSummary(supplier.volumeDiscounts)}
        </Field>
        <Field icon={Boxes} label="Descuento por cantidad de unidades">
          {quantityDiscountsSummary(supplier.quantityDiscounts)}
        </Field>
      </dl>
    </Card>
  );
}
