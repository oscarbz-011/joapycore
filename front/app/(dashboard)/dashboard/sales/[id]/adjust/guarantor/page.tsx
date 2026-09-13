'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { salesApi, type CreateGuarantorPayload, type DocumentType } from '../../../../../../../lib/api/sales';
import { NumericInput } from '../../../../../../../components/numeric-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';

const EMPTY_FORM: CreateGuarantorPayload = {
  firstName: '',
  lastName: '',
  documentType: 'CI',
  documentNumber: '',
  phone: '',
  email: '',
  address: '',
  monthlyIncome: undefined,
};

function docLabel(type: DocumentType): string {
  return type === 'CI' ? 'C.I.' : type === 'RUC' ? 'RUC' : 'Pasaporte';
}

export default function NewGuarantorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const back = () => router.push(`/dashboard/sales/${id}/adjust`);

  const [form, setForm] = useState<CreateGuarantorPayload>(EMPTY_FORM);
  const [error, setError] = useState('');

  function set<K extends keyof CreateGuarantorPayload>(k: K, v: CreateGuarantorPayload[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CreateGuarantorPayload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        documentType: form.documentType,
        documentNumber: form.documentNumber.trim(),
        phone: form.phone?.trim() || undefined,
        email: form.email?.trim() || undefined,
        address: form.address?.trim() || undefined,
        monthlyIncome: form.monthlyIncome || undefined,
      };
      return salesApi.addGuarantor(id, payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['sale-order', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['sale-orders'] });
      back();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al guardar el garante'));
    },
  });

  const canSubmit = form.firstName.trim() && form.lastName.trim() && form.documentNumber.trim();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Nuevo garante</h1>
          <p className="mt-1 text-sm text-muted-foreground">Se agrega al pedido y volvés a la vista de ajuste</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          saveMutation.mutate();
        }}
      >
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <section className="p-6 space-y-4">
            <p className={SECTION_LABEL}>Datos personales</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required placeholder="Juan" />
              </div>
              <div className="space-y-1.5">
                <Label>Apellido <span className="text-destructive">*</span></Label>
                <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required placeholder="Pérez" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de documento</Label>
                <Select value={form.documentType} onValueChange={(v) => set('documentType', v as DocumentType)}>
                  <SelectTrigger className="w-full">
                    <span className="flex-1 text-left text-sm truncate">{docLabel(form.documentType)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CI">C.I.</SelectItem>
                    <SelectItem value="RUC">RUC</SelectItem>
                    <SelectItem value="PASSPORT">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Número de documento <span className="text-destructive">*</span></Label>
                <Input value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} required placeholder="1234567-8" />
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

          <section className="p-6 space-y-4 border-t border-border">
            <p className={SECTION_LABEL}>Contacto</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="juan@ejemplo.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="0981 000 000" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Dirección</Label>
                <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Av. Mariscal López 1234" />
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4 bg-muted/10">
            <div className="flex-1 min-w-0">
              {error && <p className="text-sm text-destructive truncate">{error}</p>}
            </div>
            <Button type="button" variant="outline" onClick={back}>Cancelar</Button>
            <Button type="submit" disabled={!canSubmit || saveMutation.isPending} className="shrink-0">
              {saveMutation.isPending ? 'Guardando...' : 'Agregar garante'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
