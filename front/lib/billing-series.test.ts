import { describe, expect, it } from "vitest";
import type { BillingSeries, BillingSeriesOption } from "./api/billing";
import {
  defaultSeriesId,
  documentNumberError,
  emptySeriesForm,
  formToPayload,
  lockedFields,
  needsDocumentNumber,
  seriesLabel,
  seriesStatus,
  seriesToForm,
  todayInParaguay,
  validateSeriesForm,
} from "./billing-series";

function makeSeries(overrides: Partial<BillingSeries> = {}): BillingSeries {
  return {
    id: "series-1",
    branchId: "branch-1",
    documentType: "INVOICE",
    modality: "PREPRINTED",
    timbrado: "12345678",
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2026-12-31T00:00:00.000Z",
    establecimiento: "001",
    puntoExpedicion: "002",
    serieCode: "",
    rangeFrom: 1,
    rangeTo: 500,
    nextNumber: 42,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    branch: { id: "branch-1", name: "Central" },
    _count: { invoices: 0 },
    ...overrides,
  };
}

const option = (
  overrides: Partial<BillingSeriesOption> = {},
): BillingSeriesOption => ({ ...makeSeries(), problem: null, ...overrides });

describe("seriesLabel", () => {
  it("shows the numbering, the modality and the timbrado", () => {
    expect(seriesLabel(makeSeries())).toBe(
      "001-002 · Talonario de imprenta · Timbrado 12345678",
    );
    expect(seriesLabel(makeSeries({ timbrado: null }))).toContain(
      "Timbrado sin cargar",
    );
  });
});

describe("seriesStatus", () => {
  const june = new Date("2026-06-15T15:00:00.000Z");

  it.each([
    [{}, "active"],
    [{ isActive: false }, "inactive"],
    [{ timbrado: null }, "incomplete"],
    [{ validFrom: "2026-07-01T00:00:00.000Z" }, "upcoming"],
    [{ validUntil: "2026-05-31T00:00:00.000Z" }, "expired"],
  ] as const)("%o → %s", (overrides, status) => {
    expect(seriesStatus(makeSeries(overrides), june)).toBe(status);
  });

  it("uses the calendar day of Paraguay, not UTC", () => {
    // 23:30 del 31/12 en Asunción ya es 1/1 en UTC.
    const lateNight = new Date("2027-01-01T02:30:00.000Z");
    expect(todayInParaguay(lateNight)).toBe("2026-12-31");
    expect(seriesStatus(makeSeries(), lateNight)).toBe("active");
  });
});

describe("validateSeriesForm", () => {
  const valid = {
    ...emptySeriesForm(),
    branchId: "branch-1",
    timbrado: "12345678",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    rangeTo: "500",
  };

  it("accepts a complete form", () => {
    expect(validateSeriesForm(valid)).toEqual({});
  });

  it("explains each invalid field", () => {
    const errors = validateSeriesForm({
      ...valid,
      branchId: "",
      timbrado: "123",
      validUntil: "2025-12-31",
      establecimiento: "1",
      rangeFrom: "600",
      nextNumber: "900",
    });
    expect(errors).toMatchObject({
      branchId: "Elegí la sucursal",
      timbrado: "El timbrado tiene 8 dígitos",
      validUntil: "La vigencia termina antes de empezar",
      establecimiento: "Tres dígitos, por ejemplo 001",
      rangeTo: "El rango termina antes de empezar",
      nextNumber: "Tiene que estar dentro del rango",
    });
  });

  it("sends numbers and omits an empty next number", () => {
    expect(formToPayload(valid)).toEqual({
      branchId: "branch-1",
      modality: "PREPRINTED",
      timbrado: "12345678",
      validFrom: "2026-01-01",
      validUntil: "2026-12-31",
      establecimiento: "001",
      puntoExpedicion: "001",
      rangeFrom: 1,
      rangeTo: 500,
    });
    expect(formToPayload({ ...valid, nextNumber: "37" }).nextNumber).toBe(37);
  });

  it("round-trips a stored series", () => {
    expect(seriesToForm(makeSeries())).toMatchObject({
      validFrom: "2026-01-01",
      validUntil: "2026-12-31",
      rangeTo: "500",
      nextNumber: "42",
    });
  });
});

describe("lockedFields", () => {
  it("locks nothing while the series has not numbered invoices", () => {
    expect(lockedFields(makeSeries()).size).toBe(0);
  });

  it("locks the numbering once used, but lets a missing timbrado be completed", () => {
    const used = lockedFields(makeSeries({ _count: { invoices: 3 } }));
    expect(used.has("timbrado")).toBe(true);
    expect(used.has("validUntil")).toBe(false);
    expect(used.has("rangeTo")).toBe(false);

    const migrated = lockedFields(
      makeSeries({
        timbrado: null,
        validFrom: null,
        _count: { invoices: 3 },
      }),
    );
    expect(migrated.has("timbrado")).toBe(false);
    expect(migrated.has("validFrom")).toBe(false);
    expect(migrated.has("modality")).toBe(true);
  });
});

describe("issue helpers", () => {
  it("preselects the only usable series", () => {
    expect(
      defaultSeriesId([option(), option({ id: "b", problem: "Vencida" })]),
    ).toBe("series-1");
    expect(defaultSeriesId([option(), option({ id: "b" })])).toBe("");
    expect(defaultSeriesId([])).toBe("");
  });

  it("asks for the talonario number only on preprinted series", () => {
    expect(needsDocumentNumber(makeSeries())).toBe(true);
    expect(needsDocumentNumber(makeSeries({ modality: "SELF_PRINTED" }))).toBe(
      false,
    );
    expect(needsDocumentNumber(undefined)).toBe(false);
  });

  it("checks the talonario number against the range", () => {
    const series = makeSeries();
    expect(documentNumberError("", series)).toBe(
      "Cargá el número del talonario",
    );
    expect(documentNumberError("501", series)).toBe(
      "Fuera del rango del talonario (1 a 500)",
    );
    expect(documentNumberError("41", series)).toBeNull();
  });
});
