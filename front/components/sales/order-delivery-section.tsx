/** El bloque "Entrega" del detalle de una venta. */
export function OrderDeliverySection({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-5 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        Entrega
      </p>
      {children}
    </div>
  );
}
