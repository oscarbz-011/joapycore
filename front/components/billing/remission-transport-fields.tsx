'use client';

import type { RemissionCompany, RemissionPlace, TransportType } from '@/lib/api/remission-notes';
import {
  ownCarrier,
  type RemissionDraft,
  TRANSPORT_TYPE_LABELS,
  type TransportDraft,
} from '@/lib/remission-notes';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const SECTION_LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground/60';
const TRANSPORT_TYPES: TransportType[] = ['OWN', 'THIRD_PARTY'];

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  required = true,
  type = 'text',
  placeholder,
  hint,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  type?: 'text' | 'date';
  placeholder?: string;
  hint?: string;
}>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PlaceFields({
  idPrefix,
  title,
  place,
  onChange,
  disabled,
}: Readonly<{
  idPrefix: string;
  title: string;
  place: RemissionPlace;
  onChange: (place: RemissionPlace) => void;
  disabled?: boolean;
}>) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-foreground">{title}</legend>
      <Field
        id={`${idPrefix}-address`}
        label="Dirección"
        value={place.address}
        disabled={disabled}
        onChange={(address) => onChange({ ...place, address })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${idPrefix}-city`}
          label="Ciudad"
          value={place.city}
          disabled={disabled}
          onChange={(city) => onChange({ ...place, city })}
        />
        <Field
          id={`${idPrefix}-department`}
          label="Departamento"
          value={place.department}
          disabled={disabled}
          onChange={(department) => onChange({ ...place, department })}
        />
      </div>
    </fieldset>
  );
}

/** Recorrido, fechas, vehículo, transportista y conductor (art. 33 del Decreto 6539/05). */
export function RemissionTransportFields({
  draft,
  onChange,
  company,
  today,
  disabled,
}: Readonly<{
  draft: RemissionDraft;
  onChange: (draft: RemissionDraft) => void;
  company: RemissionCompany;
  today: string;
  disabled?: boolean;
}>) {
  const t = draft.transport;
  const setTransport = (patch: Partial<TransportDraft>) =>
    onChange({ ...draft, transport: { ...t, ...patch } });
  const setType = (type: TransportType) =>
    setTransport(
      type === 'OWN'
        ? { type, ...ownCarrier(company) }
        : { type, carrierName: '', carrierRuc: '', carrierAddress: '' },
    );

  return (
    <>
      <Card className="space-y-5 p-6">
        <h2 className={SECTION_LABEL}>Recorrido</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <PlaceFields
            idPrefix="origin"
            title="Punto de partida"
            place={draft.origin}
            disabled={disabled}
            onChange={(origin) => onChange({ ...draft, origin })}
          />
          <PlaceFields
            idPrefix="destination"
            title="Punto de llegada"
            place={draft.destination}
            disabled={disabled}
            onChange={(destination) => onChange({ ...draft, destination })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="transport-start"
            label="Inicio del traslado"
            type="date"
            value={t.startDate}
            disabled={disabled}
            onChange={(startDate) =>
              setTransport({ startDate, endDate: t.endDate < startDate ? startDate : t.endDate })
            }
            hint={t.startDate < today ? 'La nota se emite antes de que salga la mercadería.' : undefined}
          />
          <Field
            id="transport-end"
            label="Fin del traslado"
            type="date"
            value={t.endDate}
            disabled={disabled}
            onChange={(endDate) => setTransport({ endDate })}
          />
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <h2 className={SECTION_LABEL}>Transporte</h2>
        <div role="group" aria-label="Quién transporta" className="grid gap-2 sm:grid-cols-2">
          {TRANSPORT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={t.type === type}
              disabled={disabled}
              onClick={() => setType(type)}
              className={cn(
                'rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
                t.type === type ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/20',
              )}
            >
              {TRANSPORT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground">Vehículo</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              id="vehicle-brand"
              label="Marca"
              value={t.vehicleBrand}
              disabled={disabled}
              onChange={(vehicleBrand) => setTransport({ vehicleBrand })}
            />
            <Field
              id="vehicle-plate"
              label="Chapa o RUA"
              value={t.vehiclePlate}
              disabled={disabled}
              onChange={(vehiclePlate) => setTransport({ vehiclePlate })}
            />
            <Field
              id="vehicle-trailer"
              label="Chapa del remolque"
              required={false}
              value={t.trailerPlate}
              disabled={disabled}
              onChange={(trailerPlate) => setTransport({ trailerPlate })}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground">Transportista</legend>
          {t.type === 'OWN' && (
            <p className="text-xs text-muted-foreground">Con vehículo propio, el transportista es la empresa.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="carrier-name"
              label="Nombre o razón social"
              value={t.carrierName}
              disabled={disabled}
              onChange={(carrierName) => setTransport({ carrierName })}
            />
            <Field
              id="carrier-ruc"
              label="RUC"
              value={t.carrierRuc}
              disabled={disabled}
              onChange={(carrierRuc) => setTransport({ carrierRuc })}
            />
          </div>
          <Field
            id="carrier-address"
            label="Domicilio fiscal"
            value={t.carrierAddress}
            disabled={disabled}
            onChange={(carrierAddress) => setTransport({ carrierAddress })}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground">Conductor</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="driver-name"
              label="Nombre y apellido"
              value={t.driverName}
              disabled={disabled}
              onChange={(driverName) => setTransport({ driverName })}
            />
            <Field
              id="driver-document"
              label="Cédula"
              value={t.driverDocument}
              disabled={disabled}
              onChange={(driverDocument) => setTransport({ driverDocument })}
            />
          </div>
          <Field
            id="driver-address"
            label="Dirección"
            value={t.driverAddress}
            disabled={disabled}
            onChange={(driverAddress) => setTransport({ driverAddress })}
          />
        </fieldset>
      </Card>

      <Card className="space-y-1.5 p-6">
        <Label htmlFor="remission-notes">Observaciones</Label>
        <Textarea
          id="remission-notes"
          rows={2}
          maxLength={500}
          value={draft.notes}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
          placeholder="Pesos, cadena de frío, carga peligrosa…"
        />
        <p className="text-xs text-muted-foreground">Opcional. Se imprime en la nota.</p>
      </Card>
    </>
  );
}
