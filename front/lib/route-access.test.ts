import { describe, expect, it } from "vitest";
import { checkRouteAccess, findRouteRule, ROUTE_RULES } from "./route-access";
import { PERMISSION_GROUPS } from "./permissions";

describe("findRouteRule", () => {
  it("uses the most specific prefix", () => {
    expect(findRouteRule("/dashboard/sales/quotes/abc")?.prefix).toBe(
      "/dashboard/sales/quotes",
    );
    expect(findRouteRule("/dashboard/sales/123")?.prefix).toBe(
      "/dashboard/sales",
    );
  });

  it("does not match a prefix that is only a string prefix of another segment", () => {
    // /dashboard/hrx no es parte de /dashboard/hr
    expect(findRouteRule("/dashboard/hrx")).toBeUndefined();
  });

  it("leaves the settings root and profile open", () => {
    expect(findRouteRule("/dashboard/settings")).toBeUndefined();
    expect(findRouteRule("/dashboard/settings/profile")).toBeUndefined();
    expect(findRouteRule("/dashboard")).toBeUndefined();
  });

  it("uses route-specific inventory permissions before the broad fallback", () => {
    expect(findRouteRule("/dashboard/inventory/products/abc")?.prefix).toBe(
      "/dashboard/inventory/products",
    );
    expect(findRouteRule("/dashboard/inventory/categories")?.prefix).toBe(
      "/dashboard/inventory/categories",
    );
    expect(findRouteRule("/dashboard/inventory/brands")?.prefix).toBe(
      "/dashboard/inventory/brands",
    );
    expect(findRouteRule("/dashboard/inventory/movements")?.prefix).toBe(
      "/dashboard/inventory/movements",
    );
    expect(findRouteRule("/dashboard/inventory/stock")?.prefix).toBe(
      "/dashboard/inventory/stock",
    );
  });
});

describe("checkRouteAccess", () => {
  it("blocks a screen of an inactive module", () => {
    expect(
      checkRouteAccess("/dashboard/production", [], ["production:orders:read"]),
    ).toEqual({
      allowed: false,
      reason: "module",
      modules: ["production"],
    });
  });

  it("blocks when no required permission is present", () => {
    expect(
      checkRouteAccess("/dashboard/hr/payroll", ["hr"], ["hr:read"]),
    ).toEqual({
      allowed: false,
      reason: "permission",
    });
  });

  it("allows with any one of the listed permissions", () => {
    expect(
      checkRouteAccess(
        "/dashboard/sales/quotes",
        ["sales"],
        ["sales:quotes:read"],
      ).allowed,
    ).toBe(true);
    expect(
      checkRouteAccess(
        "/dashboard/logistics/mine/1",
        ["logistics"],
        ["logistics:track"],
      ).allowed,
    ).toBe(true);
  });

  it("does not grant every inventory route from one unrelated read permission", () => {
    expect(
      checkRouteAccess(
        "/dashboard/inventory/products",
        ["inventory"],
        ["inventory:products:read"],
      ).allowed,
    ).toBe(true);
    expect(
      checkRouteAccess(
        "/dashboard/inventory/categories",
        ["inventory"],
        ["inventory:products:read"],
      ),
    ).toEqual({ allowed: false, reason: "permission" });
    expect(
      checkRouteAccess(
        "/dashboard/inventory/movements",
        ["inventory"],
        ["inventory:categories:read"],
      ),
    ).toEqual({ allowed: false, reason: "permission" });
    expect(
      checkRouteAccess(
        "/dashboard/inventory/stock",
        ["inventory"],
        ["inventory:categories:read"],
      ),
    ).toEqual({ allowed: false, reason: "permission" });
    expect(
      checkRouteAccess(
        "/dashboard/inventory/stock",
        ["inventory"],
        ["inventory:products:read"],
      ).allowed,
    ).toBe(true);
  });

  it("protects the legacy email redirect with Communications access", () => {
    expect(
      checkRouteAccess(
        "/dashboard/applications/email",
        [],
        ["communications:access"],
      ).allowed,
    ).toBe(true);
    expect(
      checkRouteAccess(
        "/dashboard/applications/email",
        [],
        ["applications:email:read"],
      ),
    ).toEqual({
      allowed: false,
      reason: "permission",
    });
    expect(checkRouteAccess("/dashboard/applications/email", [], [])).toEqual({
      allowed: false,
      reason: "permission",
    });
  });

  it("only references permissions that exist in the catalog", () => {
    const catalog = new Set(
      PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)),
    );
    const unknown = ROUTE_RULES.flatMap((r) => r.anyPermission ?? []).filter(
      (p) => !catalog.has(p),
    );
    expect(unknown).toEqual([]);
  });

  it("requires the new communication permission even if legacy email was allowed", () => {
    const path = "/dashboard/applications/communications";
    expect(checkRouteAccess(path, [], ["communications:access"]).allowed).toBe(
      true,
    );
    expect(
      checkRouteAccess(path, [], ["applications:email:read"]).allowed,
    ).toBe(false);
    expect(checkRouteAccess(path, [], []).allowed).toBe(false);
  });
});
