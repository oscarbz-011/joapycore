'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { SearchSelect } from '@/app/(dashboard)/dashboard/components/search-select';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import { inventoryApi } from '@/lib/api/inventory';
import { tenantsApi } from '@/lib/api/tenants';
import {
  habitualUnits,
  matchesUnit,
  type UnitOfMeasure,
  unitOfMeasure,
  UNITS_OF_MEASURE,
} from '@/lib/units-of-measure';

const optionLabel = (unit: UnitOfMeasure) => `${unit.name} (${unit.symbol})`;
const SEARCH = 'search';

/**
 * Unidad de medida de la tabla de SIFEN. Muestra solo las habituales (las del
 * rubro y las que la empresa ya usa); las demás se buscan. Una unidad nueva
 * pasa a ser habitual en cuanto algún producto la usa.
 */
export function UnitSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: number;
  onChange: (code: number) => void;
}) {
  const [searching, setSearching] = useState(false);
  const { data: tenant } = useQuery({ queryKey: ['tenant-me'], queryFn: tenantsApi.getMe });
  const { data: inUse = [] } = useQuery({
    queryKey: ['units-in-use'],
    queryFn: inventoryApi.getUnitsInUse,
  });
  const habitual = habitualUnits(tenant?.industry, inUse, value);

  if (searching) {
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <SearchSelect<UnitOfMeasure>
            items={[...UNITS_OF_MEASURE]}
            value={String(value)}
            onChange={(code) => {
              if (!code) return;
              onChange(Number(code));
              setSearching(false);
            }}
            getKey={(unit) => String(unit.code)}
            getLabel={optionLabel}
            filterFn={matchesUnit}
            placeholder="Buscar unidad (litro, kg, caja…)"
            emptyMessage="No hay una unidad de SIFEN con ese nombre"
          />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setSearching(false)}>
          Volver
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        if (!v) return;
        if (v === SEARCH) setSearching(true);
        else onChange(Number(v));
      }}
    >
      <SelectTrigger id={id} className="w-full">
        <span className="flex flex-1 text-left text-sm">{optionLabel(unitOfMeasure(value))}</span>
      </SelectTrigger>
      <SelectContent>
        {habitual.map((unit) => (
          <SelectItem key={unit.code} value={String(unit.code)}>
            {optionLabel(unit)}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={SEARCH}>
          <Search size={13} className="text-muted-foreground" />
          Buscar otra unidad…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
