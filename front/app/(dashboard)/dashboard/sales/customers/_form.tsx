'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  salesApi,
  type Customer,
  type CreateCustomerPayload,
  type DocumentType,
  type EconomicActivity,
} from '../../../../../lib/api/sales';
import { NumericInput } from '../../../../../components/numeric-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateCustomerPayload = {
  firstName: '', secondFirstName: '', lastName: '', secondLastName: '',
  documentType: undefined, documentNumber: '', email: '', phone: '',
  address: '', city: '', profession: '', monthlyIncome: undefined, notes: '',
  economicActivity: undefined, hasIpsInsurance: undefined,
  employerName: '', supervisorName: '', workPhone: '', workAddress: '', workSeniority: '',
  homeStreet: '', homeNeighborhood: '', homeReference: '',
  aptBuilding: '', aptFloor: '', aptNumber: '',
};

function fromCustomer(c: Customer): CreateCustomerPayload {
  return {
    firstName:        c.firstName,
    secondFirstName:  c.secondFirstName ?? '',
    lastName:         c.lastName,
    secondLastName:   c.secondLastName ?? '',
    documentType:     c.documentType ?? undefined,
    documentNumber:   c.documentNumber ?? '',
    email:            c.email ?? '',
    phone:            c.phone ?? '',
    address:          c.address ?? '',
    city:             c.city ?? '',
    profession:       c.profession ?? '',
    monthlyIncome:    c.monthlyIncome ?? undefined,
    notes:            c.notes ?? '',
    economicActivity: c.economicActivity ?? undefined,
    hasIpsInsurance:  c.hasIpsInsurance ?? undefined,
    employerName:     c.employerName ?? '',
    supervisorName:   c.supervisorName ?? '',
    workPhone:        c.workPhone ?? '',
    workAddress:      c.workAddress ?? '',
    workSeniority:    c.workSeniority ?? '',
    homeStreet:        c.homeStreet ?? '',
    homeNeighborhood:  c.homeNeighborhood ?? '',
    homeReference:     c.homeReference ?? '',
    aptBuilding:       c.aptBuilding ?? '',
    aptFloor:          c.aptFloor ?? '',
    aptNumber:         c.aptNumber ?? '',
  };
}

function docLabel(type: DocumentType): string {
  return type === 'CI' ? 'C.I.' : type === 'RUC' ? 'RUC' : 'Pasaporte';
}

const ECONOMIC_ACTIVITY_LABELS: Record<EconomicActivity, string> = {
  ASALARIADO: 'Asalariado',
  FUNCIONARIO_PUBLICO: 'Funcionario público',
  PROFESIONAL_INDEPENDIENTE: 'Profesional independiente',
  COMERCIANTE: 'Comerciante',
};

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  initial?: Customer;
  onDone: (customer?: Customer) => void;
}

export function CustomerForm({ initial, onDone }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateCustomerPayload>(
    initial ? fromCustomer(initial) : EMPTY_FORM,
  );
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof CreateCustomerPayload>(k: K, v: CreateCustomerPayload[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CreateCustomerPayload = {
        firstName:        form.firstName.trim(),
        secondFirstName:  form.secondFirstName?.trim() || undefined,
        lastName:         form.lastName.trim(),
        secondLastName:   form.secondLastName?.trim() || undefined,
        documentType:     form.documentType || undefined,
        documentNumber:   form.documentNumber?.trim() || undefined,
        email:            form.email?.trim() || undefined,
        phone:            form.phone?.trim() || undefined,
        address:          form.address?.trim() || undefined,
        city:             form.city?.trim() || undefined,
        profession:       form.profession?.trim() || undefined,
        monthlyIncome:    form.monthlyIncome || undefined,
        notes:            form.notes?.trim() || undefined,
        economicActivity: form.economicActivity || undefined,
        hasIpsInsurance:  form.hasIpsInsurance,
        employerName:     form.employerName?.trim() || undefined,
        supervisorName:   form.supervisorName?.trim() || undefined,
        workPhone:        form.workPhone?.trim() || undefined,
        workAddress:      form.workAddress?.trim() || undefined,
        workSeniority:    form.workSeniority?.trim() || undefined,
        homeStreet:       form.homeStreet?.trim() || undefined,
        homeNeighborhood: form.homeNeighborhood?.trim() || undefined,
        homeReference:    form.homeReference?.trim() || undefined,
        aptBuilding:      form.aptBuilding?.trim() || undefined,
        aptFloor:         form.aptFloor?.trim() || undefined,
        aptNumber:        form.aptNumber?.trim() || undefined,
      };
      return initial
        ? salesApi.updateCustomer(initial.id, payload)
        : salesApi.createCustomer(payload);
    },
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ['sale-customers'] });
      onDone(customer);
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al guardar'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => salesApi.deleteCustomer(initial!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sale-customers'] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        saveMutation.mutate();
      }}
    >
      <div className="rounded-xl border border-border bg-card overflow-hidden">

        {/* Datos personales */}
        <section className="p-6 space-y-4">
          <p className={SECTION_LABEL}>Datos personales</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Primer nombre <span className="text-destructive">*</span></Label>
              <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required placeholder="María" />
            </div>
            <div className="space-y-1.5">
              <Label>Segundo nombre</Label>
              <Input value={form.secondFirstName ?? ''} onChange={(e) => set('secondFirstName', e.target.value)} placeholder="Isabel" />
            </div>
            <div className="space-y-1.5">
              <Label>Primer apellido <span className="text-destructive">*</span></Label>
              <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required placeholder="González" />
            </div>
            <div className="space-y-1.5">
              <Label>Segundo apellido</Label>
              <Input value={form.secondLastName ?? ''} onChange={(e) => set('secondLastName', e.target.value)} placeholder="Rodríguez" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo de documento</Label>
              <Select value={form.documentType || 'none'} onValueChange={(v) => set('documentType', v && v !== 'none' ? v as DocumentType : undefined)}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">{form.documentType ? docLabel(form.documentType) : '— Seleccionar —'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seleccionar —</SelectItem>
                  <SelectItem value="CI">C.I.</SelectItem>
                  <SelectItem value="RUC">RUC</SelectItem>
                  <SelectItem value="PASSPORT">Pasaporte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Número de documento</Label>
              <Input value={form.documentNumber ?? ''} onChange={(e) => set('documentNumber', e.target.value)} placeholder="1234567-8" />
            </div>
            <div className="space-y-1.5">
              <Label>Profesión</Label>
              <Input value={form.profession ?? ''} onChange={(e) => set('profession', e.target.value)} placeholder="Comerciante" />
            </div>
            <div className="space-y-1.5">
              <Label>Ingresos mensuales (Gs.)</Label>
              <NumericInput
                value={form.monthlyIncome ?? 0}
                onChange={(v) => set('monthlyIncome', v || undefined)}
                className={NUM_CLS}
                placeholder="0"
              />
            </div>
          </div>
        </section>

        {/* Contacto */}
        <section className="p-6 space-y-4 border-t border-border">
          <p className={SECTION_LABEL}>Contacto</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="maria@ejemplo.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="0981 000 000" />
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} placeholder="Asunción" />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección general</Label>
              <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Av. Mariscal López 1234" />
            </div>
          </div>
        </section>

        {/* Datos laborales */}
        <section className="p-6 space-y-4 border-t border-border">
          <p className={SECTION_LABEL}>Datos laborales</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Actividad económica</Label>
              <Select
                value={form.economicActivity ?? 'none'}
                onValueChange={(v) => set('economicActivity', v && v !== 'none' ? v as EconomicActivity : undefined)}
              >
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">
                    {form.economicActivity ? ECONOMIC_ACTIVITY_LABELS[form.economicActivity] : '— Seleccionar —'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seleccionar —</SelectItem>
                  {Object.entries(ECONOMIC_ACTIVITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Seguro IPS</Label>
              <Select
                value={form.hasIpsInsurance === true ? 'yes' : form.hasIpsInsurance === false ? 'no' : 'unset'}
                onValueChange={(v) => set('hasIpsInsurance', v === 'yes' ? true : v === 'no' ? false : undefined)}
              >
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">
                    {form.hasIpsInsurance === true ? 'Sí' : form.hasIpsInsurance === false ? 'No' : '— Seleccionar —'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">— Seleccionar —</SelectItem>
                  <SelectItem value="yes">Sí</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Input value={form.employerName ?? ''} onChange={(e) => set('employerName', e.target.value)} placeholder="Nombre de la empresa" />
            </div>
            <div className="space-y-1.5">
              <Label>Jefe/Supervisor</Label>
              <Input value={form.supervisorName ?? ''} onChange={(e) => set('supervisorName', e.target.value)} placeholder="Nombre del jefe o supervisor" />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono laboral</Label>
              <Input value={form.workPhone ?? ''} onChange={(e) => set('workPhone', e.target.value)} placeholder="021 000 000" />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección laboral</Label>
              <Input value={form.workAddress ?? ''} onChange={(e) => set('workAddress', e.target.value)} placeholder="Av. Mariscal López 1234" />
            </div>
            <div className="space-y-1.5">
              <Label>Antigüedad laboral</Label>
              <Input value={form.workSeniority ?? ''} onChange={(e) => set('workSeniority', e.target.value)} placeholder="2 años (opcional)" />
            </div>
          </div>
        </section>

        {/* Dirección — Casa */}
        <section className="p-6 space-y-4 border-t border-border">
          <p className={SECTION_LABEL}>Dirección de entrega — Casa</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Calle</Label>
              <Input value={form.homeStreet ?? ''} onChange={(e) => set('homeStreet', e.target.value)} placeholder="Mcal. López 1234" />
            </div>
            <div className="space-y-1.5">
              <Label>Barrio</Label>
              <Input value={form.homeNeighborhood ?? ''} onChange={(e) => set('homeNeighborhood', e.target.value)} placeholder="Villa Morra" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Referencia</Label>
            <Input value={form.homeReference ?? ''} onChange={(e) => set('homeReference', e.target.value)} placeholder="Frente al supermercado Buen Precio" />
          </div>
        </section>

        {/* Dirección — Departamento */}
        <section className="p-6 space-y-4 border-t border-border">
          <p className={SECTION_LABEL}>Dirección de entrega — Departamento</p>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Edificio</Label>
              <Input value={form.aptBuilding ?? ''} onChange={(e) => set('aptBuilding', e.target.value)} placeholder="Torre Carmelitas" />
            </div>
            <div className="space-y-1.5">
              <Label>Piso</Label>
              <Input value={form.aptFloor ?? ''} onChange={(e) => set('aptFloor', e.target.value)} placeholder="3" />
            </div>
            <div className="space-y-1.5">
              <Label>Nro.</Label>
              <Input value={form.aptNumber ?? ''} onChange={(e) => set('aptNumber', e.target.value)} placeholder="3B" />
            </div>
          </div>
        </section>

        {/* Notas */}
        <section className="p-6 space-y-4 border-t border-border">
          <p className={SECTION_LABEL}>Notas</p>

          <textarea
            className={TEXTAREA_CLS}
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Observaciones sobre el cliente..."
          />
        </section>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4 bg-muted/10">
          <div className="flex-1 min-w-0">
            {error && <p className="text-sm text-destructive truncate">{error}</p>}
          </div>

          {initial && !confirmDelete && (
            <Button
              type="button"
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 shrink-0"
              onClick={() => setConfirmDelete(true)}
            >
              Eliminar cliente
            </Button>
          )}

          {initial && confirmDelete && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-destructive">¿Confirmar eliminación?</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </Button>
            </div>
          )}

          <Button type="submit" disabled={saveMutation.isPending} className="shrink-0">
            {saveMutation.isPending ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      </div>
    </form>
  );
}
