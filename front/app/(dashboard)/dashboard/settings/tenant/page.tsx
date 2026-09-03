'use client';

import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Trash2 } from 'lucide-react';
import {
  tenantsApi,
  type TenantResponse,
  type UpdateTenantPayload,
  type ActividadEconomica,
} from '../../../../../lib/api/tenants';
import { filesApi } from '../../../../../lib/api/files';
import { useAuth } from '../../../../../lib/auth-context';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Logo de la empresa ────────────────────────────────────────────────────────
// El endpoint de descarga va autenticado por Bearer token, así que no se puede
// usar <img src> directo al archivo — se baja el blob y se arma un object URL
// (mismo criterio que front/lib/blob-file.ts para descargas).
function LogoUploader({ tenant, canEdit }: { tenant: TenantResponse; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!tenant.logoFileId) {
      setPreviewUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setLoadingPreview(true);
    filesApi
      .downloadBlob(tenant.logoFileId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setPreviewUrl(null); })
      .finally(() => { if (!cancelled) setLoadingPreview(false); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tenant.logoFileId]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const record = await filesApi.upload(file, {
        module: 'tenants', entityType: 'tenant', entityId: tenant.id,
      });
      return tenantsApi.updateMe({ logoFileId: record.id });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tenant'] }),
  });

  const removeMutation = useMutation({
    mutationFn: () => tenantsApi.updateMe({ logoFileId: null }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tenant'] }),
  });

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-1">Logo de la empresa</label>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/20">
          {loadingPreview ? (
            <span className="text-[11px] text-muted-foreground/60">...</span>
          ) : previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Logo de la empresa" className="h-full w-full object-contain" />
          ) : (
            <Building2 size={20} className="text-muted-foreground/40" />
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/20 disabled:opacity-50"
            >
              {uploadMutation.isPending ? 'Subiendo...' : previewUrl ? 'Cambiar' : 'Subir logo'}
            </button>
            {previewUrl && (
              <button
                type="button"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
                className="text-sm font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"
              >
                Quitar
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </div>
      {uploadMutation.isError && (
        <p className="mt-1.5 text-xs text-destructive">No se pudo subir el logo. Intentá de nuevo.</p>
      )}
    </div>
  );
}

const EMPLOYEE_RANGES = [
  { value: 'RANGE_1_5',    label: '1 – 5' },
  { value: 'RANGE_6_20',   label: '6 – 20' },
  { value: 'RANGE_21_50',  label: '21 – 50' },
  { value: 'RANGE_51_200', label: '51 – 200' },
  { value: 'RANGE_201',    label: '201+' },
] as const;

const CURRENCIES = [
  { value: 'PYG', label: 'PYG – Guaraní' },
  { value: 'USD', label: 'USD – Dólar' },
  { value: 'BRL', label: 'BRL – Real' },
  { value: 'ARS', label: 'ARS – Peso Argentino' },
  { value: 'EUR', label: 'EUR – Euro' },
];

const TIPOS_CONTRIBUYENTE = [
  { value: '', label: 'Seleccionar...' },
  { value: '1', label: '1 – Persona Física' },
  { value: '2', label: '2 – Persona Jurídica' },
];

const TIPOS_REGIMEN = [
  { value: '', label: 'Seleccionar...' },
  { value: '8', label: '8 – IVA General' },
  { value: '1', label: '1 – Simplificado' },
];

const inputClass =
  'w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring/30 disabled:bg-muted/20 disabled:text-muted-foreground/60 disabled:cursor-not-allowed';

type FormState = {
  name: string;
  razonSocial: string;
  nombreFantasia: string;
  ruc: string;
  email: string;
  phone: string;
  address: string;
  numeroCasa: string;
  postalCode: string;
  city: string;
  department: string;
  country: string;
  employeeCount: string;
  currency: string;
  // SIFEN
  timbradoNumero: string;
  timbradoFecha: string;
  timbradoFechaFin: string;
  tipoContribuyente: string;
  tipoRegimen: string;
  departamentoCodigo: string;
  departamentoDesc: string;
  distritoCodigo: string;
  distritoDesc: string;
  ciudadCodigo: string;
  ciudadDesc: string;
};

function fromTenant(t: Awaited<ReturnType<typeof tenantsApi.getMe>>): FormState {
  return {
    name:              t.name ?? '',
    razonSocial:       t.razonSocial ?? '',
    nombreFantasia:    t.nombreFantasia ?? '',
    ruc:               t.ruc ?? '',
    email:             t.email ?? '',
    phone:             t.phone ?? '',
    address:           t.address ?? '',
    numeroCasa:        t.numeroCasa ?? '',
    postalCode:        t.postalCode ?? '',
    city:              t.city ?? '',
    department:        t.department ?? '',
    country:           t.country ?? 'Paraguay',
    employeeCount:     t.employeeCount ?? 'RANGE_1_5',
    currency:          t.currency ?? 'PYG',
    timbradoNumero:    t.timbradoNumero ?? '',
    timbradoFecha:     t.timbradoFecha ? t.timbradoFecha.split('T')[0] : '',
    timbradoFechaFin:  t.timbradoFechaFin ? t.timbradoFechaFin.split('T')[0] : '',
    tipoContribuyente: t.tipoContribuyente?.toString() ?? '',
    tipoRegimen:       t.tipoRegimen?.toString() ?? '',
    departamentoCodigo: t.departamentoCodigo?.toString() ?? '',
    departamentoDesc:   t.departamentoDesc ?? '',
    distritoCodigo:     t.distritoCodigo?.toString() ?? '',
    distritoDesc:       t.distritoDesc ?? '',
    ciudadCodigo:       t.ciudadCodigo?.toString() ?? '',
    ciudadDesc:         t.ciudadDesc ?? '',
  };
}

function blankActividad(): ActividadEconomica {
  return { codigo: 0, descripcion: '' };
}

export default function TenantPage() {
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const canEdit = jwtPayload?.permissions.includes('tenants:update') ?? false;

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant'],
    queryFn: tenantsApi.getMe,
  });

  const [form, setForm] = useState<FormState>({
    name: '', razonSocial: '', nombreFantasia: '', ruc: '', email: '', phone: '',
    address: '', numeroCasa: '', postalCode: '', city: '', department: '',
    country: 'Paraguay', employeeCount: 'RANGE_1_5', currency: 'PYG',
    timbradoNumero: '', timbradoFecha: '', timbradoFechaFin: '', tipoContribuyente: '', tipoRegimen: '',
    departamentoCodigo: '', departamentoDesc: '', distritoCodigo: '', distritoDesc: '',
    ciudadCodigo: '', ciudadDesc: '',
  });

  const [actividades, setActividades] = useState<ActividadEconomica[]>([]);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (tenant) {
      setForm(fromTenant(tenant));
      setActividades(tenant.actividadesEconomicas ?? []);
    }
  }, [tenant]);

  const isDirty = tenant
    ? JSON.stringify(form) !== JSON.stringify(fromTenant(tenant)) ||
      JSON.stringify(actividades) !== JSON.stringify(tenant.actividadesEconomicas ?? [])
    : false;

  const mutation = useMutation({
    mutationFn: () => {
      const payload: UpdateTenantPayload = {
        name:              form.name || undefined,
        razonSocial:       form.razonSocial || undefined,
        nombreFantasia:    form.nombreFantasia || undefined,
        ruc:               form.ruc || undefined,
        email:             form.email || undefined,
        phone:             form.phone || undefined,
        address:           form.address || undefined,
        numeroCasa:        form.numeroCasa || undefined,
        postalCode:        form.postalCode || undefined,
        city:              form.city || undefined,
        department:        form.department || undefined,
        country:           form.country || undefined,
        employeeCount:     form.employeeCount as UpdateTenantPayload['employeeCount'],
        currency:          form.currency || undefined,
        timbradoNumero:    form.timbradoNumero || undefined,
        timbradoFecha:     form.timbradoFecha || undefined,
        timbradoFechaFin:  form.timbradoFechaFin || undefined,
        tipoContribuyente: form.tipoContribuyente ? Number(form.tipoContribuyente) : undefined,
        tipoRegimen:       form.tipoRegimen ? Number(form.tipoRegimen) : undefined,
        departamentoCodigo: form.departamentoCodigo ? Number(form.departamentoCodigo) : undefined,
        departamentoDesc:   form.departamentoDesc || undefined,
        distritoCodigo:    form.distritoCodigo ? Number(form.distritoCodigo) : undefined,
        distritoDesc:      form.distritoDesc || undefined,
        ciudadCodigo:      form.ciudadCodigo ? Number(form.ciudadCodigo) : undefined,
        ciudadDesc:        form.ciudadDesc || undefined,
        actividadesEconomicas: actividades.filter((a) => a.codigo && a.descripcion),
      };
      return tenantsApi.updateMe(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant'] });
      setSuccess(true);
      setServerError('');
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setServerError(err?.response?.data?.message ?? 'Error al guardar');
    },
  });

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // Para DatePicker, que entrega el valor directo (no un evento) en onChange.
  const setValue = (field: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const addActividad = () => setActividades((a) => [...a, blankActividad()]);
  const removeActividad = (i: number) => setActividades((a) => a.filter((_, idx) => idx !== i));
  const setActividad = (i: number, field: keyof ActividadEconomica, val: string) =>
    setActividades((a) => a.map((item, idx) =>
      idx === i ? { ...item, [field]: field === 'codigo' ? Number(val) : val } : item,
    ));

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Mi empresa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Información legal, de contacto y datos fiscales de tu organización.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setServerError('');
          mutation.mutate();
        }}
        className="space-y-6"
      >
        {/* ── Datos de la empresa ─────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Datos de la empresa</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Nombre comercial</label>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={set('name')}
                  disabled={!canEdit}
                  placeholder="Mi Empresa S.A."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Razón social</label>
                <input
                  className={inputClass}
                  value={form.razonSocial}
                  onChange={set('razonSocial')}
                  disabled={!canEdit}
                  placeholder="Mi Empresa Sociedad Anónima"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Nombre de fantasía</label>
                <input
                  className={inputClass}
                  value={form.nombreFantasia}
                  onChange={set('nombreFantasia')}
                  disabled={!canEdit}
                  placeholder="Electro Sur"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">RUC</label>
                <input
                  className={inputClass}
                  value={form.ruc}
                  onChange={set('ruc')}
                  disabled={!canEdit}
                  placeholder="80012345-6"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Plan</label>
              <input className={inputClass} value={tenant?.plan ?? ''} disabled readOnly />
            </div>

            {tenant && <LogoUploader tenant={tenant} canEdit={canEdit} />}
          </div>
        </section>

        {/* ── Contacto y ubicación ────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Contacto y ubicación</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Email</label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={set('email')}
                  disabled={!canEdit}
                  placeholder="contacto@empresa.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Teléfono</label>
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={set('phone')}
                  disabled={!canEdit}
                  placeholder="+595 21 000 0000"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Dirección</label>
                <input
                  className={inputClass}
                  value={form.address}
                  onChange={set('address')}
                  disabled={!canEdit}
                  placeholder="Av. Mcal. López"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Número</label>
                <input
                  className={inputClass}
                  value={form.numeroCasa}
                  onChange={set('numeroCasa')}
                  disabled={!canEdit}
                  placeholder="123"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Ciudad</label>
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={set('city')}
                  disabled={!canEdit}
                  placeholder="Asunción"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Departamento</label>
                <input
                  className={inputClass}
                  value={form.department}
                  onChange={set('department')}
                  disabled={!canEdit}
                  placeholder="Central"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Código postal</label>
                <input
                  className={inputClass}
                  value={form.postalCode}
                  onChange={set('postalCode')}
                  disabled={!canEdit}
                  placeholder="1001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">País</label>
                <input
                  className={inputClass}
                  value={form.country}
                  onChange={set('country')}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Configuración operacional ───────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Configuración</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Tamaño de empresa</label>
              <Select value={form.employeeCount} onValueChange={(v) => v && setForm((f) => ({ ...f, employeeCount: v }))} disabled={!canEdit}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{EMPLOYEE_RANGES.find((r) => r.value === form.employeeCount)?.label ?? form.employeeCount} empleados</span>
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label} empleados</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Moneda base</label>
              <Select value={form.currency} onValueChange={(v) => v !== null && setForm((f) => ({ ...f, currency: v }))} disabled={!canEdit}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{CURRENCIES.find((c) => c.value === form.currency)?.label ?? form.currency}</span>
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ── Facturación Electrónica (SIFEN) ────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Facturación Electrónica — SIFEN</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Datos requeridos para la emisión de documentos electrónicos ante la SET.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Tipo de contribuyente
                </label>
                <Select value={form.tipoContribuyente || 'none'} onValueChange={(v) => v !== null && setForm((f) => ({ ...f, tipoContribuyente: v === 'none' ? '' : v }))} disabled={!canEdit}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{TIPOS_CONTRIBUYENTE.find((t) => t.value === form.tipoContribuyente)?.label ?? 'Seleccionar...'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CONTRIBUYENTE.map((t) => (
                      <SelectItem key={t.value || 'none'} value={t.value || 'none'}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Tipo de régimen
                </label>
                <Select value={form.tipoRegimen || 'none'} onValueChange={(v) => v !== null && setForm((f) => ({ ...f, tipoRegimen: v === 'none' ? '' : v }))} disabled={!canEdit}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{TIPOS_REGIMEN.find((t) => t.value === form.tipoRegimen)?.label ?? 'Seleccionar...'}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_REGIMEN.map((t) => (
                      <SelectItem key={t.value || 'none'} value={t.value || 'none'}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Número de timbrado
                </label>
                <input
                  className={inputClass}
                  value={form.timbradoNumero}
                  onChange={set('timbradoNumero')}
                  disabled={!canEdit}
                  placeholder="12345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Inicio de vigencia
                </label>
                <DatePicker
                  value={form.timbradoFecha}
                  onChange={setValue('timbradoFecha')}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Fin de vigencia
                </label>
                <DatePicker
                  value={form.timbradoFechaFin}
                  onChange={setValue('timbradoFechaFin')}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Dirección estructurada SET */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Dirección — códigos catálogo SET
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Cód. Departamento</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.departamentoCodigo}
                    onChange={set('departamentoCodigo')}
                    disabled={!canEdit}
                    placeholder="11"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Descripción departamento</label>
                  <input
                    className={inputClass}
                    value={form.departamentoDesc}
                    onChange={set('departamentoDesc')}
                    disabled={!canEdit}
                    placeholder="CAPITAL"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Cód. Distrito</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.distritoCodigo}
                    onChange={set('distritoCodigo')}
                    disabled={!canEdit}
                    placeholder="143"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Descripción distrito</label>
                  <input
                    className={inputClass}
                    value={form.distritoDesc}
                    onChange={set('distritoDesc')}
                    disabled={!canEdit}
                    placeholder="ASUNCION"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Cód. Ciudad</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={form.ciudadCodigo}
                    onChange={set('ciudadCodigo')}
                    disabled={!canEdit}
                    placeholder="1"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Descripción ciudad</label>
                  <input
                    className={inputClass}
                    value={form.ciudadDesc}
                    onChange={set('ciudadDesc')}
                    disabled={!canEdit}
                    placeholder="ASUNCION (DISTRITO)"
                  />
                </div>
              </div>
            </div>

            {/* Actividades económicas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Actividades económicas
                </p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={addActividad}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus size={12} /> Agregar
                  </button>
                )}
              </div>
              {actividades.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">Sin actividades cargadas.</p>
              ) : (
                <div className="space-y-2">
                  {actividades.map((act, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="number"
                        className={`${inputClass} w-28 shrink-0`}
                        value={act.codigo || ''}
                        onChange={(e) => setActividad(i, 'codigo', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Código"
                      />
                      <input
                        className={inputClass}
                        value={act.descripcion}
                        onChange={(e) => setActividad(i, 'descripcion', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Descripción"
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeActividad(i)}
                          className="shrink-0 text-muted-foreground/60 hover:text-destructive transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {canEdit && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!isDirty || mutation.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {success && <span className="text-sm text-emerald-600">Cambios guardados</span>}
            {serverError && <span className="text-sm text-destructive">{serverError}</span>}
          </div>
        )}
      </form>
    </div>
  );
}
