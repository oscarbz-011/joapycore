export type StockLevel = "available" | "critical" | "out";
export type StockLevelFilter = "all" | "available" | "critical";

export interface StockProductLike {
  id: string;
  name: string;
  model: string | null;
  category: { name: string } | null;
  brand: { name: string } | null;
  stock: number;
  stockMin: number;
}

export function getStockLevel(product: StockProductLike): StockLevel {
  if (product.stock <= 0) return "out";
  if (product.stock <= product.stockMin) return "critical";
  return "available";
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function filterStockProducts<T extends StockProductLike>(
  products: readonly T[],
  search: string,
  level: StockLevelFilter,
): T[] {
  const query = normalize(search.trim());
  const levelOrder: Record<StockLevel, number> = {
    out: 0,
    critical: 1,
    available: 2,
  };

  return products
    .filter((product) => {
      const stockLevel = getStockLevel(product);
      if (level === "critical" && stockLevel === "available") return false;
      if (level === "available" && stockLevel !== "available") return false;
      if (!query) return true;

      return [
        product.name,
        product.model,
        product.category?.name,
        product.brand?.name,
      ].some((value) => value && normalize(value).includes(query));
    })
    .sort((left, right) => {
      const byLevel =
        levelOrder[getStockLevel(left)] - levelOrder[getStockLevel(right)];
      if (byLevel !== 0) return byLevel;
      if (left.stock !== right.stock) return left.stock - right.stock;
      return left.name.localeCompare(right.name, "es");
    });
}

export function summarizeStock(products: readonly StockProductLike[]) {
  let available = 0;
  let critical = 0;
  let out = 0;

  for (const product of products) {
    const level = getStockLevel(product);
    if (level === "available") available += 1;
    else critical += 1;
    if (level === "out") out += 1;
  }

  return { total: products.length, available, critical, out };
}
