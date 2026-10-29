import type {
  BillingModality,
  BillingSeries,
  BillingSeriesOption,
  CreateBillingSeriesPayload,
} from "./api/billing";

export const MODALITY_LABELS: Record<BillingModality, string> = {
  PREPRINTED: "Talonario de imprenta",
  SELF_PRINTED: "Impresión propia",
  ELECTRONIC: "Electrónica",
};

// La facturación electrónica llega en la etapa de SIFEN.
export const SELECTABLE_MODALITIES: BillingModality[] = [
  "PREPRINTED",
  "SELF_PRINTED",
];

export const MAX_DOCUMENT_NUMBER = 9_999_999;

export function seriesCode(
  series: Pick<BillingSeries, "establecimiento" | "puntoExpedicion">,
): string {
  return `${series.establecimiento}-${series.puntoExpedicion}`;
}

export function seriesLabel(
  series: Pick<
    BillingSeries,
    "establecimiento" | "puntoExpedicion" | "modality" | "timbrado"
  >,
): string {
  return `${seriesCode(series)} · ${MODALITY_LABELS[series.modality]} · Timbrado ${series.timbrado ?? "sin cargar"}`;
}

/** Día calendario de hoy en Paraguay, AAAA-MM-DD. */
export function todayInParaguay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type SeriesStatus =
  | "active"
  | "inactive"
  | "incomplete"
  | "expired"
  | "upcoming";

export const SERIES_STATUS_LABELS: Record<SeriesStatus, string> = {
  active: "Vigente",
  inactive: "Desactivada",
  incomplete: "Sin timbrado",
  expired: "Vencida",
  upcoming: "Por empezar",
};

export function seriesStatus(
  series: Pick<
    BillingSeries,
    "isActive" | "timbrado" | "validFrom" | "validUntil"
  >,
  now: Date = new Date(),
): SeriesStatus {
  if (!series.isActive) return "inactive";
  if (!series.timbrado || !series.validFrom || !series.validUntil) {
    return "incomplete";
  }
  const today = todayInParaguay(now);
  if (today < series.validFrom.slice(0, 10)) return "upcoming";
  if (today > series.validUntil.slice(0, 10)) return "expired";
  return "active";
}

export interface SeriesForm {
  branchId: string;
  modality: BillingModality;
  timbrado: string;
  validFrom: string;
  validUntil: string;
  establecimiento: string;
  puntoExpedicion: string;
  rangeFrom: string;
  rangeTo: string;
  nextNumber: string;
}

export type SeriesFormErrors = Partial<Record<keyof SeriesForm, string>>;

export function emptySeriesForm(): SeriesForm {
  return {
    branchId: "",
    modality: "PREPRINTED",
    timbrado: "",
    validFrom: "",
    validUntil: "",
    establecimiento: "001",
    puntoExpedicion: "001",
    rangeFrom: "1",
    rangeTo: "",
    nextNumber: "",
  };
}

export function seriesToForm(series: BillingSeries): SeriesForm {
  return {
    branchId: series.branchId,
    modality: series.modality,
    timbrado: series.timbrado ?? "",
    validFrom: series.validFrom?.slice(0, 10) ?? "",
    validUntil: series.validUntil?.slice(0, 10) ?? "",
    establecimiento: series.establecimiento,
    puntoExpedicion: series.puntoExpedicion,
    rangeFrom: String(series.rangeFrom),
    rangeTo: String(series.rangeTo),
    nextNumber: String(series.nextNumber),
  };
}

/**
 * Campos que ya no se pueden cambiar porque la serie numeró facturas. El
 * timbrado y su inicio se pueden completar solo si faltaban.
 */
export function lockedFields(
  series: BillingSeries | undefined,
): Set<keyof SeriesForm> {
  if (!series || series._count.invoices === 0) return new Set();
  const locked = new Set<keyof SeriesForm>([
    "branchId",
    "modality",
    "establecimiento",
    "puntoExpedicion",
    "rangeFrom",
    "nextNumber",
  ]);
  if (series.timbrado) locked.add("timbrado");
  if (series.validFrom) locked.add("validFrom");
  return locked;
}

const isPositiveInt = (value: string) => /^\d+$/.test(value) && Number(value) >= 1;

export function validateSeriesForm(form: SeriesForm): SeriesFormErrors {
  const errors: SeriesFormErrors = {};
  if (!form.branchId) errors.branchId = "Elegí la sucursal";
  if (!/^\d{8}$/.test(form.timbrado)) {
    errors.timbrado = "El timbrado tiene 8 dígitos";
  }
  if (!form.validFrom) errors.validFrom = "Cargá el inicio de vigencia";
  if (!form.validUntil) errors.validUntil = "Cargá el fin de vigencia";
  if (form.validFrom && form.validUntil && form.validFrom > form.validUntil) {
    errors.validUntil = "La vigencia termina antes de empezar";
  }
  if (!/^\d{3}$/.test(form.establecimiento)) {
    errors.establecimiento = "Tres dígitos, por ejemplo 001";
  }
  if (!/^\d{3}$/.test(form.puntoExpedicion)) {
    errors.puntoExpedicion = "Tres dígitos, por ejemplo 001";
  }
  const from = Number(form.rangeFrom);
  const to = Number(form.rangeTo);
  if (!isPositiveInt(form.rangeFrom) || from > MAX_DOCUMENT_NUMBER) {
    errors.rangeFrom = "Número entre 1 y 9.999.999";
  }
  if (!isPositiveInt(form.rangeTo) || to > MAX_DOCUMENT_NUMBER) {
    errors.rangeTo = "Número entre 1 y 9.999.999";
  } else if (!errors.rangeFrom && from > to) {
    errors.rangeTo = "El rango termina antes de empezar";
  }
  if (form.nextNumber) {
    const next = Number(form.nextNumber);
    if (!isPositiveInt(form.nextNumber) || next < from || next > to + 1) {
      errors.nextNumber = "Tiene que estar dentro del rango";
    }
  }
  return errors;
}

export function formToPayload(form: SeriesForm): CreateBillingSeriesPayload {
  return {
    branchId: form.branchId,
    modality: form.modality,
    timbrado: form.timbrado,
    validFrom: form.validFrom,
    validUntil: form.validUntil,
    establecimiento: form.establecimiento,
    puntoExpedicion: form.puntoExpedicion,
    rangeFrom: Number(form.rangeFrom),
    rangeTo: Number(form.rangeTo),
    ...(form.nextNumber ? { nextNumber: Number(form.nextNumber) } : {}),
  };
}

/** Las series que pueden numerar hoy, y cuál elegir si hay una sola. */
export function usableOptions(
  options: BillingSeriesOption[],
): BillingSeriesOption[] {
  return options.filter((o) => !o.problem);
}

export function defaultSeriesId(options: BillingSeriesOption[]): string {
  const usable = usableOptions(options);
  return usable.length === 1 ? usable[0].id : "";
}

export function needsDocumentNumber(
  series: Pick<BillingSeries, "modality"> | undefined,
): boolean {
  return series?.modality === "PREPRINTED";
}

/** Valida el número del talonario contra el rango de la serie. */
export function documentNumberError(
  value: string,
  series: Pick<BillingSeries, "rangeFrom" | "rangeTo"> | undefined,
): string | null {
  if (!series) return null;
  if (!/^\d+$/.test(value)) return "Cargá el número del talonario";
  const n = Number(value);
  if (n < series.rangeFrom || n > series.rangeTo) {
    return `Fuera del rango del talonario (${series.rangeFrom} a ${series.rangeTo})`;
  }
  return null;
}
