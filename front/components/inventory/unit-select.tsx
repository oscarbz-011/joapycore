'use client';

import { useQuery } from '@tanstack/react-query';
import { tenantsApi } from '@/lib/api/tenants';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import {
  type UnitOfMeasure,
  unitOfMeasure,
  unitOptionGroups,
} from '@/lib/units-of-measure';

const optionLabel = (unit: UnitOfMeasure) => `${unit.name} (${unit.symbol})`;

/** Unidad de medida de un producto, de la tabla de SIFEN. */
export function UnitSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: number;
  onChange: (code: number) => void;
}) {
  const { data: tenant } = useQuery({ queryKey: ['tenant-me'], queryFn: tenantsApi.getMe });
  const { suggested, others } = unitOptionGroups(tenant?.industry);

  return (
    <Select value={String(value)} onValueChange={(v) => v && onChange(Number(v))}>
      <SelectTrigger id={id} className="w-full">
        <span className="flex flex-1 text-left text-sm">{optionLabel(unitOfMeasure(value))}</span>
      </SelectTrigger>
      <SelectContent>
        {suggested.length > 0 && (
          <>
            <SelectGroup>
              <SelectLabel>De tu rubro</SelectLabel>
              {suggested.map((u) => (
                <SelectItem key={u.code} value={String(u.code)}>{optionLabel(u)}</SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
          </>
        )}
        <SelectGroup>
          {suggested.length > 0 && <SelectLabel>Todas las de SIFEN</SelectLabel>}
          {others.map((u) => (
            <SelectItem key={u.code} value={String(u.code)}>{optionLabel(u)}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
