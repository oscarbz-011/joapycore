import Link from "next/link";
import { Boxes } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function StockPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Stock</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulta consolidada de existencias.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Boxes className="size-10 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">
              La vista consolidada de stock está en preparación.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Mientras tanto, consultá las existencias actuales desde Productos.
            </p>
          </div>
          <Link
            href="/dashboard/inventory/products"
            className={buttonVariants({ variant: "outline" })}
          >
            Ir a Productos
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
