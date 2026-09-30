"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CheckCircle2, Search } from "lucide-react";

import { apiErrorMessage } from "@/lib/api/api-error";
import { inventoryApi, type ProductWithStock } from "@/lib/api/inventory";
import {
  filterStockProducts,
  getStockLevel,
  summarizeStock,
  type StockLevel,
  type StockLevelFilter,
} from "@/lib/inventory-stock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const LEVEL_LABEL: Record<StockLevel, string> = {
  available: "Disponible",
  critical: "Crítico",
  out: "Agotado",
};

function StockLevelBadge({ product }: { product: ProductWithStock }) {
  const level = getStockLevel(product);
  if (level === "out") return <Badge variant="destructive">Agotado</Badge>;
  if (level === "critical") {
    return (
      <Badge className="border-warn/30 bg-warn-subtle text-warn hover:bg-warn-subtle">
        Crítico
      </Badge>
    );
  }
  return <Badge variant="secondary">Disponible</Badge>;
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Boxes;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {value}
          </p>
        </div>
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </CardContent>
    </Card>
  );
}

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<StockLevelFilter>("all");
  const stockQuery = useQuery<ProductWithStock[]>({
    queryKey: ["inventory-products-with-stock"],
    queryFn: () => inventoryApi.listProductsWithStock({ status: "ACTIVE" }),
  });
  const products = useMemo(() => stockQuery.data ?? [], [stockQuery.data]);
  const summary = useMemo(() => summarizeStock(products), [products]);
  const filtered = useMemo(
    () => filterStockProducts(products, search, level),
    [level, products, search],
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">
          Stock
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Existencias actuales comparadas con el mínimo configurado de cada
          producto.
        </p>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Productos activos"
          value={summary.total}
          icon={Boxes}
        />
        <SummaryCard
          label="Disponibles"
          value={summary.available}
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Stock crítico"
          value={summary.critical}
          icon={AlertTriangle}
        />
        <SummaryCard
          label="Agotados"
          value={summary.out}
          icon={AlertTriangle}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Buscar stock"
            className="pl-9"
            placeholder="Buscar producto, modelo, categoría o marca..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          value={level}
          onValueChange={(value) =>
            setLevel((value ?? "all") as StockLevelFilter)
          }
        >
          <SelectTrigger
            className="w-full sm:w-48"
            aria-label="Filtrar por nivel de stock"
          >
            {level === "all" ? "Todos los niveles" : LEVEL_LABEL[level]}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niveles</SelectItem>
            <SelectItem value="critical">Crítico y agotado</SelectItem>
            <SelectItem value="available">Disponible</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {stockQuery.isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Cargando existencias...
        </div>
      ) : stockQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertTriangle
              className="size-8 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm text-destructive">
              {apiErrorMessage(
                stockQuery.error,
                "No se pudieron cargar las existencias.",
              )}
            </p>
            <Button variant="outline" onClick={() => void stockQuery.refetch()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {products.length === 0
              ? "No hay productos activos para consultar."
              : "No hay existencias que coincidan con los filtros."}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 text-xs uppercase tracking-wide">
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/inventory/products/${product.id}`}
                      className="font-semibold text-foreground hover:underline"
                    >
                      {product.name}
                    </Link>
                    {product.model && (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {product.model}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.category?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.brand?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {product.stock} {product.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {product.stockMin} {product.unit}
                  </TableCell>
                  <TableCell>
                    <StockLevelBadge product={product} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
