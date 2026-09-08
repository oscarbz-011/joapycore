// Utilidad de fechas compartida — reemplaza los formatDate/formatDateLocal
// duplicados por archivo. Todo el manejo de "días de calendario" (fechas sin
// hora, tipo YYYY-MM-DD) usa Date.UTC/getUTCDate — nunca el constructor local
// new Date(y,m,d) ni getDate(), para no correr el día un lugar según el
// timezone del navegador (mismo criterio del fix de timezone de esta sesión).

export function parseISODate(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// anchor='utc': para días de calendario (dueDate, vencimientos, fechas
// elegidas por el usuario) — ancla en UTC para preservar el día exacto sin
// importar el timezone de quien mira la pantalla. anchor='local': para
// instantes reales (issuedAt, createdAt, orderDate, etc.) — hora de Paraguay
// explícita (America/Asuncion), no el default del proceso/navegador. Ver
// ARCHITECTURE.md v0.39 — qué campo usa cada anchor ya está decidido, esta
// función solo consolida la implementación que antes estaba duplicada por
// archivo.
export function formatDatePY(iso?: string | null, anchor: 'utc' | 'local' = 'utc'): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: anchor === 'utc' ? 'UTC' : 'America/Asuncion',
  });
}

// "Hoy" como día de calendario UTC — para cálculos como computeFirstDueDateISO
// en billing/invoices/[id]/page.tsx.
export function todayISODate(): string {
  const now = new Date();
  return toISODate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

// Día calendario en Paraguay (America/Asuncion) de un instante real —
// para comparar timestamps genuinos (orderDate, issuedAt, createdAt...)
// contra "hoy" sin el bug de tomar el prefijo UTC crudo: pasadas las
// ~21:00 en Paraguay (UTC-3), un instante de "hoy" ya cruzó a las 00:00
// UTC del día siguiente, así que un `.toISOString().slice(0,10)` (o
// `.startsWith(...)` contra ese mismo prefijo) da "mañana" en vez de
// "hoy" durante esas horas. No confundir con toISODate()/todayISODate(),
// que son para DÍAS DE CALENDARIO ya sin hora (dueDate, paymentDate) —
// esto es para INSTANTES reales, ver el criterio de anchor en
// formatDatePY() arriba.
export function localISODate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
