import type { TenantBrand } from './api/tenants';

export interface CompanyOption {
  id: string;
  name: string;
  /** RUC o razón social: lo que distingue a dos empresas con nombre parecido. */
  detail: string | null;
}

/** Hasta dos letras: "Ferro S.A." → "FS", "Mueblería" → "M". */
export function companyMonogram(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

/** La empresa en la que se está trabajando; mientras carga, el nombre de la sesión. */
export function currentCompany(brand: TenantBrand | undefined, tenantId: string | undefined, sessionName: string | undefined): CompanyOption | null {
  if (brand) {
    return { id: brand.id, name: brand.name, detail: brand.ruc ? `RUC ${brand.ruc}` : brand.razonSocial };
  }
  return tenantId && sessionName ? { id: tenantId, name: sessionName, detail: null } : null;
}

/**
 * Las empresas que el usuario puede abrir. Hoy un usuario pertenece a una sola;
 * cuando un plan permita administrar varias, la lista vendrá del servidor.
 */
export function companyOptions(current: CompanyOption | null): CompanyOption[] {
  return current ? [current] : [];
}
