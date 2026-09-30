import { describe, expect, it } from "vitest";
import {
  canPrintInvoicePdf,
  canRetryInvoicePdf,
  invoicePdfAction,
} from "./api/billing";

describe("invoicePdfAction", () => {
  it.each([
    ["PENDING", null, null],
    ["ISSUED", "pdf-1", "print"],
    ["PAID", "pdf-1", "print"],
    ["ISSUED", null, "retry"],
    ["PAID", null, "retry"],
  ] as const)("selects %s with PDF %s: %s", (status, pdfFileId, expected) => {
    expect(invoicePdfAction({ status, pdfFileId })).toBe(expected);
  });
});

describe("canRetryInvoicePdf", () => {
  it.each([
    ["PENDING", null, false],
    ["ISSUED", null, true],
    ["PAID", null, true],
    ["CANCELLED", null, false],
    ["ISSUED", "pdf-1", false],
    ["PAID", "pdf-1", false],
  ] as const)(
    "allows retry for %s with PDF %s: %s",
    (status, pdfFileId, expected) => {
      expect(canRetryInvoicePdf({ status, pdfFileId })).toBe(expected);
    },
  );
});

describe("canPrintInvoicePdf", () => {
  it.each([
    ["PENDING", "pdf-1", false],
    ["CANCELLED", "pdf-1", false],
    ["ISSUED", "pdf-1", true],
    ["PAID", "pdf-1", true],
    ["ISSUED", null, false],
    ["PAID", null, false],
  ] as const)(
    "shows Print for %s with PDF %s: %s",
    (status, pdfFileId, expected) => {
      expect(canPrintInvoicePdf({ status, pdfFileId })).toBe(expected);
    },
  );
});
