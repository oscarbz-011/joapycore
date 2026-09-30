import { describe, expect, it } from "vitest";

import {
  filterStockProducts,
  getStockLevel,
  summarizeStock,
} from "./inventory-stock";

const products = [
  {
    id: "available",
    name: "Taladro",
    model: "T-20",
    category: { name: "Herramientas" },
    brand: { name: "Acme" },
    stock: 8,
    stockMin: 3,
  },
  {
    id: "critical",
    name: "Tornillo",
    model: null,
    category: { name: "Fijaciones" },
    brand: null,
    stock: 2,
    stockMin: 2,
  },
  {
    id: "out",
    name: "Martillo",
    model: "M-1",
    category: null,
    brand: { name: "Herramax" },
    stock: 0,
    stockMin: 0,
  },
];

describe("inventory stock view", () => {
  it("classifies current stock against the configured minimum", () => {
    expect(getStockLevel(products[0])).toBe("available");
    expect(getStockLevel(products[1])).toBe("critical");
    expect(getStockLevel(products[2])).toBe("out");
  });

  it("filters critical stock including products that are out of stock", () => {
    expect(
      filterStockProducts(products, "", "critical").map((p) => p.id),
    ).toEqual(["out", "critical"]);
  });

  it("searches product, model, category, and brand without case sensitivity", () => {
    expect(
      filterStockProducts(products, "TALADRO", "all").map((p) => p.id),
    ).toEqual(["available"]);
    expect(
      filterStockProducts(products, "t-20", "all").map((p) => p.id),
    ).toEqual(["available"]);
    expect(
      filterStockProducts(products, "herramientas", "all").map((p) => p.id),
    ).toEqual(["available"]);
    expect(
      filterStockProducts(products, "herramax", "all").map((p) => p.id),
    ).toEqual(["out"]);
  });

  it("reports totals for available, critical, and out-of-stock products", () => {
    expect(summarizeStock(products)).toEqual({
      total: 3,
      available: 1,
      critical: 2,
      out: 1,
    });
  });
});
