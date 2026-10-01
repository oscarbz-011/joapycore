# Inventory Stock and Sales Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the product catalog from warehouse-aware physical stock, make the inventory sidebar the only module navigation, and support independent `NORMAL`, `POS`, and `ECOMMERCE` product sales channels.

**Architecture:** Replace the global sellable flag with channel membership, add warehouse location to serialized units, and expose a dedicated inventory stock read module that hides the two stock calculation strategies. The Next.js frontend consumes that interface through explicit sidebar routes while all stock mutations remain in Movimientos.

**Tech Stack:** NestJS 11, Prisma 7/PostgreSQL, Jest 30, Next.js 16 App Router, React 19, TanStack Query, Vitest 3, TypeScript, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-30-inventory-navigation-stock-sales-channels-design.md`

## Global Constraints

- Use pnpm for every package or script command.
- Preserve unrelated working-tree changes in `BACK/package.json`, pnpm lock/workspace files, and any other user-owned files.
- Existing sellable products migrate to `[NORMAL]`; `POS` and `ECOMMERCE` are never enabled implicitly.
- Stock includes only `ACTIVE` products with at least one sales channel, including products with zero quantity.
- All new stock-changing operations identify an active warehouse; legacy null locations remain “Sin depósito asignado”.
- Keep the existing inventory permissions; do not introduce a stock-specific permission.
- Use App Router server `redirect()` for compatibility routes, per the repository-local Next.js 16 documentation.
- Follow red-green-refactor for every behavior change and commit only files owned by the current task.

## Review Focus

- An `ACTIVE` product with no channels must be absent from Stock and rejected by every sales flow; Task 2 and Task 4 pin this behavior.
- Selecting one warehouse must retain eligible products with zero there while preserving their company-wide total; Task 4 pins this behavior.
- Inactive warehouses with quantity must remain visible but reject new movements; Task 3 and Task 4 pin this behavior.
- Legacy movement/unit rows with null warehouse must appear only in `unassignedStock`; Task 4 pins this behavior.
- Serialized transfers must update unit locations and movement history atomically without double-counting stock; Task 3 pins this behavior.

---

### Task 1: Product sales-channel model and catalog filters

**Files:**
- Create: `BACK/prisma/migrations/20260930120000_product_sales_channels/migration.sql`
- Create: `BACK/src/modules/inventory/repositories/products.repository.spec.ts`
- Modify: `BACK/prisma/schema.prisma`
- Modify: `BACK/src/modules/inventory/constants/product-kind.constant.ts`
- Modify: `BACK/src/modules/inventory/dto/create-product.dto.ts`
- Modify: `BACK/src/modules/inventory/dto/update-product.dto.ts`
- Modify: `BACK/src/modules/inventory/dto/filter-product.dto.ts`
- Modify: `BACK/src/modules/inventory/repositories/products.repository.ts`
- Modify: `BACK/src/modules/inventory/services/products.service.ts`
- Modify: `BACK/src/modules/inventory/services/products.service.spec.ts`

**Interfaces:**
- Produces: `Product.salesChannels: OrderChannel[]`, `ProductFilters.salesChannel?: OrderChannel`, and `KIND_DEFAULT_CHANNELS: Record<ProductKind, OrderChannel[]>`.
- Produces: `defaultSalesChannelsForKind(kind: ProductKind): OrderChannel[]`; return a fresh array so callers cannot mutate shared defaults.
- Migration: add/backfill `sales_channels` so `is_sellable = true` becomes `{NORMAL}` and false becomes `{}`. Keep the old database column temporarily until Task 2 updates its final backend consumer.

- [ ] **Step 1: Write failing product-default and filter tests**

Add service tests named `defaults sellable product kinds to NORMAL only`, `leaves raw materials without sales channels`, and `preserves explicitly supplied channels`. Add repository tests asserting `salesChannel: POS` creates Prisma `salesChannels: { has: POS }` and no filter leaves the field unconstrained.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd BACK; pnpm test -- --runInBand src/modules/inventory/services/products.service.spec.ts src/modules/inventory/repositories/products.repository.spec.ts`

Expected: FAIL because `salesChannels`, `KIND_DEFAULT_CHANNELS`, and the channel filter do not exist.

- [ ] **Step 3: Implement the schema, migration, DTOs, defaults, and repository filter**

Use `OrderChannel[]` in the product write/read interfaces. Remove `isSellable` from create/update/filter DTOs and from `KIND_DEFAULT_FLAGS`; retain `isPurchasable` there. Do not write the transitional `isSellable` column.

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run: `cd BACK; pnpm exec prisma generate; pnpm exec prisma validate; pnpm test -- --runInBand src/modules/inventory/services/products.service.spec.ts src/modules/inventory/repositories/products.repository.spec.ts; pnpm build`

Expected: Prisma validation succeeds and both test files pass.

- [ ] **Step 5: Commit Task 1**

Commit: `feat(inventory): add product sales channels`

### Task 2: Enforce the order channel in Sales and POS

**Files:**
- Create: `BACK/prisma/migrations/20260930123000_remove_product_is_sellable/migration.sql`
- Modify: `BACK/prisma/schema.prisma`
- Modify: `BACK/src/modules/sales/services/sale-orders.service.ts`
- Modify: `BACK/src/modules/sales/services/sale-orders.service.spec.ts`

**Interfaces:**
- Consumes: `Product.salesChannels: OrderChannel[]` from Task 1.
- Produces: `assertSellable(products, channel: OrderChannel)` behavior used by standard and POS sale creation/adjustment paths.
- Migration: remove the now-unused `is_sellable` column after all backend consumers have moved to `salesChannels`.

- [ ] **Step 1: Write failing channel-isolation tests**

Add tests named `accepts NORMAL sales only when NORMAL is enabled`, `accepts POS sales only when POS is enabled`, `rejects POS when only NORMAL is enabled`, and `rejects every channel for an active product with no channels`. Keep the existing non-active status assertions.

- [ ] **Step 2: Run the sales tests and verify RED**

Run: `cd BACK; pnpm test -- --runInBand src/modules/sales/services/sale-orders.service.spec.ts`

Expected: FAIL because validation still reads `isSellable` and does not receive the effective channel.

- [ ] **Step 3: Pass the effective `OrderChannel` through every sale path**

Standard orders, quotes, and adjustments use `NORMAL`; `createPosSale` uses `POS`. Error messages must name the product and missing channel. Remove `isSellable` from the Prisma model and apply the second migration. Do not add an e-commerce workflow.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `cd BACK; pnpm exec prisma generate; pnpm exec prisma validate; pnpm test -- --runInBand src/modules/sales/services/sale-orders.service.spec.ts; pnpm build`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Commit: `feat(sales): validate product sales channels`

### Task 3: Warehouse-aware stock mutations and serialized units

**Files:**
- Create: `BACK/prisma/migrations/20260930130000_locate_serialized_inventory/migration.sql`
- Create: `BACK/src/modules/inventory/repositories/product-units.repository.spec.ts`
- Create: `BACK/src/modules/inventory/services/stock-ledger.service.spec.ts`
- Modify: `BACK/prisma/schema.prisma`
- Modify: `BACK/src/modules/inventory/inventory.module.ts`
- Modify: `BACK/src/modules/inventory/repositories/product-units.repository.ts`
- Modify: `BACK/src/modules/inventory/repositories/stock-movements.repository.ts`
- Modify: `BACK/src/modules/inventory/services/stock-entry.service.ts`
- Modify: `BACK/src/modules/inventory/services/stock-entry.service.spec.ts`
- Modify: `BACK/src/modules/inventory/services/stock-ledger.service.ts`
- Modify: `BACK/src/modules/inventory/services/products.service.ts`
- Modify: `BACK/src/modules/inventory/services/products.service.spec.ts`
- Modify: `BACK/src/modules/inventory/dto/create-stock-movement.dto.ts`
- Modify: `BACK/src/common/contracts/stock-ledger.contract.ts`
- Modify: `BACK/src/common/utils/stock-availability.util.ts`
- Modify: `BACK/src/common/utils/stock-availability.util.spec.ts`
- Modify: `BACK/src/modules/inventory/controllers/stock-entry.controller.ts`
- Modify: `BACK/src/modules/inventory/events/inventory-on-invoice.listener.ts`
- Modify: `BACK/src/modules/inventory/events/inventory-on-production.listener.ts`
- Modify: `BACK/src/modules/inventory/events/inventory-on-purchase-receipt.listener.ts`
- Modify: `BACK/src/modules/sales/services/sale-orders.service.ts`
- Modify: `BACK/src/modules/sales/services/sale-orders.service.spec.ts`

**Interfaces:**
- Produces: nullable persisted `ProductUnit.warehouseId`; new operations require a warehouse.
- Produces: `ProductUnitStatus.ADJUSTED_OUT` for a serialized unit explicitly removed by a manual negative adjustment; unlike `DAMAGED`, it makes no claim about physical condition.
- Produces: `StockDemand { productId; warehouseId; quantity; name? }` and warehouse-keyed aggregation.
- Produces: `ProductUnitsRepository.moveInStockUnits(tenantId, productId, serialNumbers, fromWarehouseId, toWarehouseId, client): Promise<number>`.
- Produces: `StockMovementsRepository.sumByProductsAndWarehouse(tenantId, demands, client): Promise<Map<string, number>>`, keyed consistently with the demand aggregator.
- Changes: `StockLedger.assignSerialUnits(..., serialNumbers, saleItemId, warehouseId): Promise<void>`.
- Changes: `CreateGlobalStockMovementDto` accepts `serialNumbers?: string[]`; serialized entry/transfer operations require the exact selected serials.
- Consumes: `WarehousesRepository.findById(tenantId, warehouseId)` to reject missing/inactive locations.

- [ ] **Step 1: Write failing location and invariant tests**

Cover: serialized entry persists `warehouseId`; missing/inactive warehouse is rejected; demand aggregation keys by product and warehouse; non-serialized OUT/TRANSFER cannot exceed origin stock; transfer origin and destination differ; serialized transfer moves only available units from the origin; serialized negative adjustment marks selected units `ADJUSTED_OUT`; a failed serial mutation updates neither units nor history; sold serial selection rejects a unit from another warehouse.

- [ ] **Step 2: Run the inventory and sales stock tests and verify RED**

Run: `cd BACK; pnpm test -- --runInBand src/common/utils/stock-availability.util.spec.ts src/modules/inventory/services/stock-entry.service.spec.ts src/modules/inventory/services/stock-ledger.service.spec.ts src/modules/inventory/services/products.service.spec.ts src/modules/inventory/repositories/product-units.repository.spec.ts src/modules/sales/services/sale-orders.service.spec.ts`

Expected: FAIL on the new warehouse assertions.

- [ ] **Step 3: Add the nullable relation and transactional mutation behavior**

Keep `ProductUnit` as the stock source for serialized products. Write paired history movements for transfers with one reference ID, but never include those rows when calculating serialized quantity. Serialized positive adjustments/entries create or restore the supplied serials at the selected warehouse; negative adjustments mark supplied `IN_STOCK` units `ADJUSTED_OUT`. Require product sale items that affect stock to resolve an active warehouse; free-text service items remain exempt.

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run: `cd BACK; pnpm exec prisma generate; pnpm exec prisma validate; pnpm test -- --runInBand src/common/utils/stock-availability.util.spec.ts src/modules/inventory/services/stock-entry.service.spec.ts src/modules/inventory/services/stock-ledger.service.spec.ts src/modules/inventory/services/products.service.spec.ts src/modules/inventory/repositories/product-units.repository.spec.ts src/modules/sales/services/sale-orders.service.spec.ts`

Expected: PASS with no partial mutation assertions failing.

- [ ] **Step 5: Commit Task 3**

Commit: `feat(inventory): track stock by warehouse`

### Task 4: Dedicated stock read module

**Files:**
- Create: `BACK/src/modules/inventory/dto/filter-stock.dto.ts`
- Create: `BACK/src/modules/inventory/controllers/stock.controller.ts`
- Create: `BACK/src/modules/inventory/repositories/stock.repository.ts`
- Create: `BACK/src/modules/inventory/repositories/stock.repository.spec.ts`
- Create: `BACK/src/modules/inventory/services/stock.service.ts`
- Create: `BACK/src/modules/inventory/services/stock.service.spec.ts`
- Modify: `BACK/src/modules/inventory/inventory.module.ts`

**Interfaces:**
- Produces: `GET /inventory/stock?search&categoryId&brandId&warehouseId` guarded by `inventory:products:read`.
- Produces: `StockResult { warehouses: StockWarehouse[]; items: StockRow[] }` and `StockRow { product; totalStock; stockByWarehouse; unassignedStock }`.
- Produces: `StockService.findAll(tenantId: string, filters: FilterStockDto): Promise<StockResult>` as the controller/test seam; repository aggregation remains internal.

- [ ] **Step 1: Write failing stock projection tests**

Test non-serialized movement grouping, serialized `IN_STOCK` grouping, mixed totals, null locations, inactive warehouses with quantity, active products with zero stock, exclusion of non-active/no-channel products, and a warehouse filter that retains zero rows and company totals.

- [ ] **Step 2: Run the new stock tests and verify RED**

Run: `cd BACK; pnpm test -- --runInBand src/modules/inventory/repositories/stock.repository.spec.ts src/modules/inventory/services/stock.service.spec.ts`

Expected: FAIL because the stock read module does not exist.

- [ ] **Step 3: Implement the projection behind one repository/service interface**

Fetch the eligible catalog first so zero-stock products remain present. Group movement sums only for non-serialized IDs and `ProductUnit` counts only for serialized IDs. Return inactive warehouses only when they own quantity; never remap null rows.

- [ ] **Step 4: Run stock and controller-adjacent backend tests**

Run: `cd BACK; pnpm test -- --runInBand src/modules/inventory/repositories/stock.repository.spec.ts src/modules/inventory/services/stock.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Commit: `feat(inventory): expose warehouse stock view`

### Task 5: Inventory sidebar navigation and split routes

**Files:**
- Create: `front/lib/inventory-navigation.ts`
- Create: `front/lib/inventory-navigation.test.ts`
- Create: `front/app/(dashboard)/dashboard/inventory/products/page.tsx`
- Create: `front/app/(dashboard)/dashboard/inventory/categories/page.tsx`
- Create: `front/app/(dashboard)/dashboard/inventory/brands/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/inventory/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/inventory/config/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/inventory/movements/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/inventory/batches/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/inventory/stock-entries/initial/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/components/sidebar.tsx`
- Modify: `front/app/(dashboard)/dashboard/components/search-modal.tsx`
- Modify: `front/app/(dashboard)/dashboard/page.tsx`
- Modify: `front/lib/route-access.ts`
- Modify: `front/lib/route-access.test.ts`

**Interfaces:**
- Produces: `INVENTORY_NAV_ITEMS: readonly InventoryNavItem[]` with the seven approved routes and `isInventoryItemActive(pathname: string, href: string): boolean` for nested product routes.
- Produces: server redirects from `/dashboard/inventory` to `/dashboard/inventory/products` and from `/config` to `/categories`.

- [ ] **Step 1: Write failing route and permission tests**

Assert exact sidebar labels/routes, absence of “Inventario”, prefix-active behavior for `/products/:id`, and specific route access: Categories requires category read, Brands brand read, Movements movement read, Products/Stock product read, Carga inicial movement create.

- [ ] **Step 2: Run frontend navigation tests and verify RED**

Run: `cd front; pnpm test -- lib/inventory-navigation.test.ts lib/route-access.test.ts`

Expected: FAIL because routes remain stubs and permission rules are too broad.

- [ ] **Step 3: Split routes, add redirects, and remove module-level tabs**

Move the catalog implementation to `/products`; extract the existing category and brand panels into their explicit pages; keep detail tabs untouched. Use server `redirect()` pages for compatibility routes.

- [ ] **Step 4: Run navigation tests and verify GREEN**

Run: `cd front; pnpm test -- lib/inventory-navigation.test.ts lib/route-access.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

Commit: `refactor(front): route inventory from the sidebar`

### Task 6: Product catalog UI and channel consumers

**Files:**
- Create: `front/lib/product-catalog.ts`
- Create: `front/lib/product-catalog.test.ts`
- Modify: `front/lib/api/inventory.ts`
- Modify: `front/app/(dashboard)/dashboard/inventory/products/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/inventory/products/[id]/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/sales/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/sales/[id]/adjust/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/sales/quotes/new/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/pos/page.tsx`

**Interfaces:**
- Consumes: backend `salesChannels` and `salesChannel` from Tasks 1–2.
- Produces: frontend `OrderChannel`, `SALES_CHANNEL_LABEL`, `catalogKpis(products: Product[]): CatalogKpis`, `defaultSalesChannels(kind: ProductKind): OrderChannel[]`, and multi-channel product form fields.

- [ ] **Step 1: Write failing catalog/channel tests**

Test KPI counts for all four statuses, exact default channels (`NORMAL` only for resale/manufactured, none for raw material), and independent channel query params for normal Sales and POS.

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run: `cd front; pnpm test -- lib/product-catalog.test.ts`

Expected: FAIL because the catalog helper and channel types do not exist.

- [ ] **Step 3: Implement catalog-only presentation and channel selection**

Remove stock quantity/value/critical KPIs and stock columns from Products. Show status, kind, purchase capability, channels, and prices. Use `salesChannel: 'NORMAL'` in the Sales list, adjustment, and quote-product queries; use `salesChannel: 'POS'` in the POS query. Keep the UI label `ECOMMERCE` unchanged.

- [ ] **Step 4: Run focused tests, lint, and type checking**

Run: `cd front; pnpm test -- lib/product-catalog.test.ts; pnpm exec eslint 'app/(dashboard)/dashboard/inventory/products/page.tsx' 'app/(dashboard)/dashboard/inventory/products/[id]/page.tsx' 'app/(dashboard)/dashboard/sales/page.tsx' 'app/(dashboard)/dashboard/sales/[id]/adjust/page.tsx' 'app/(dashboard)/dashboard/sales/quotes/new/page.tsx' 'app/(dashboard)/dashboard/pos/page.tsx' 'lib/api/inventory.ts' 'lib/product-catalog.ts'; pnpm exec tsc --noEmit`

Expected: tests pass, ESLint reports no errors, and TypeScript exits 0.

- [ ] **Step 5: Commit Task 6**

Commit: `feat(front): manage product sales channels`

### Task 7: Stock screen and warehouse selectors in Movements

**Files:**
- Create: `front/lib/inventory-stock.ts`
- Create: `front/lib/inventory-stock.test.ts`
- Create: `front/lib/inventory-movement.ts`
- Create: `front/lib/inventory-movement.test.ts`
- Create: `front/app/(dashboard)/dashboard/inventory/stock/page.tsx`
- Modify: `front/lib/api/inventory.ts`
- Modify: `front/app/(dashboard)/dashboard/inventory/movements/page.tsx`
- Modify: `front/app/(dashboard)/dashboard/inventory/stock-entries/initial/page.tsx`

**Interfaces:**
- Consumes: `StockResult` from Task 4 and `warehousesApi.listWarehouses()`.
- Produces: `stockColumns(result: StockResult, selectedWarehouseId: string | null): StockColumn[]` and the read-only Stock UI.
- Produces: `buildMovementPayload(input: MovementForm): CreateGlobalMovementPayload`, including serial numbers for serialized entry/transfer operations.

- [ ] **Step 1: Write failing stock presentation tests**

Assert “Todos” yields total plus every located warehouse, a selected warehouse yields total plus that location, inactive locations with quantity remain, `unassignedStock` is separate, and zero values are rendered rather than dropping the row. Add movement tests proving non-serialized payloads use quantity, serialized entry payloads require unique serial numbers, and serialized transfers identify selected serials plus distinct origin/destination warehouses.

- [ ] **Step 2: Run the stock frontend tests and verify RED**

Run: `cd front; pnpm test -- lib/inventory-stock.test.ts lib/inventory-movement.test.ts`

Expected: FAIL because stock helpers and API types do not exist.

- [ ] **Step 3: Implement the Stock page and replace warehouse ID inputs**

Use TanStack Query keys containing all filters. Stock rows link to `/dashboard/inventory/products/:id` and expose no mutation buttons. Movimientos uses active warehouse selects for entry/adjustment/transfer; non-serialized operations request quantity, while serialized entries/transfers request serial numbers. Show the configure-a-deposit empty state when none are available.

- [ ] **Step 4: Run focused tests, lint, and type checking**

Run: `cd front; pnpm test -- lib/inventory-stock.test.ts lib/inventory-movement.test.ts; pnpm exec eslint 'app/(dashboard)/dashboard/inventory/stock/page.tsx' 'app/(dashboard)/dashboard/inventory/movements/page.tsx' 'app/(dashboard)/dashboard/inventory/stock-entries/initial/page.tsx' 'lib/api/inventory.ts' 'lib/inventory-stock.ts' 'lib/inventory-movement.ts'; pnpm exec tsc --noEmit`

Expected: tests pass, ESLint reports no errors, and TypeScript exits 0.

- [ ] **Step 5: Commit Task 7**

Commit: `feat(front): add warehouse stock screen`

### Task 8: Integrated migration and full verification

**Files:**
- No planned production changes; return failures to the task that owns the affected file.

**Interfaces:**
- Consumes: all prior task interfaces.
- Produces: a deployable backend/frontend pair matching the approved spec.

- [ ] **Step 1: Verify migrations against the configured development/test database**

Against a disposable database configured through `DATABASE_URL`, run: `cd BACK; pnpm exec prisma migrate deploy; pnpm exec prisma migrate status`.

Expected: both migrations apply, migration status is current, sellable rows contain only `{NORMAL}`, and existing serial units may retain null warehouse.

- [ ] **Step 2: Run the complete backend suite**

Run: `cd BACK; pnpm test -- --runInBand`

Expected: all Jest suites pass with zero failures.

- [ ] **Step 3: Run complete backend static/build checks**

Run: `cd BACK; pnpm exec eslint "{src,apps,libs,test}/**/*.ts"; pnpm exec tsc --noEmit; pnpm build`

Expected: all commands exit 0.

- [ ] **Step 4: Run the complete frontend suite and build checks**

Run: `cd front; pnpm test; pnpm exec eslint .; pnpm exec tsc --noEmit; pnpm build`

Expected: all Vitest tests pass and all other commands exit 0.

- [ ] **Step 5: Review the final diff against the spec**

Confirm all seven sidebar destinations work, no module-level inventory tabs remain, channel defaults are `NORMAL` only, Stock retains zero rows and warehouse totals, and unrelated user changes are absent from the task commits.

- [ ] **Step 6: Commit integration-only fixes, if any**

If verification reveals a cross-task integration defect, list the exact affected files before editing, add a regression test in the owning task’s test file, and commit as `fix(inventory): complete stock integration`. If no defect exists, create no empty commit.
