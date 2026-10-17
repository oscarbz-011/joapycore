"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { usePermission } from "@/lib/permissions";
import { tenantsApi } from "@/lib/api/tenants";
import { companyMonogram, companyOptions, currentCompany } from "@/lib/company-brand";

const COMPANY_PATH = "/dashboard/settings/tenant";

/** La marca del sistema: siempre la misma, en cualquier empresa. */
export function JoapyCoreBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-linear-to-br from-emerald-500 to-emerald-700 text-[15px] font-extrabold text-white shadow-[0_4px_12px_rgba(16,185,129,0.35)]">
        J
      </div>
      <span className="text-[15px] font-bold text-sidebar-foreground">JoapyCore</span>
    </div>
  );
}

function CompanyLogo({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- object URL de un blob autenticado
    return <img src={url} alt="" className="size-9 shrink-0 rounded-lg bg-white object-contain p-0.5" />;
  }
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-[13px] font-bold text-sidebar-foreground"
    >
      {companyMonogram(name)}
    </span>
  );
}

/** El logo viene de un endpoint autenticado: se baja y se muestra como object URL. */
function useLogoUrl(tenantId: string | undefined, hasLogo: boolean): string | null {
  const logo = useQuery({
    queryKey: ["tenant", "logo", tenantId],
    queryFn: tenantsApi.getLogo,
    enabled: hasLogo && !!tenantId,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const url = useMemo(() => (logo.data ? URL.createObjectURL(logo.data) : null), [logo.data]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return hasLogo ? url : null;
}

/** La empresa en la que se trabaja, con lugar para cambiar a otra. */
export function CompanySwitcher() {
  const router = useRouter();
  const { jwtPayload } = useAuth();
  const canSeeCompany = usePermission("tenants:read");
  const tenantId = jwtPayload?.tenantId;
  const brand = useQuery({
    queryKey: ["tenant", "brand", tenantId],
    queryFn: tenantsApi.getBrand,
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });
  const logoUrl = useLogoUrl(tenantId, brand.data?.hasLogo ?? false);
  const current = currentCompany(brand.data, tenantId, jwtPayload?.tenantName);
  if (!current) return null;
  const options = companyOptions(current);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Empresa: ${current.name}. Cambiar de empresa`}
        title={current.name}
        className="flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <CompanyLogo name={current.name} url={logoUrl} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/45">Empresa</span>
          <span className="block truncate text-[13.5px] font-semibold text-sidebar-foreground">{current.name}</span>
          {current.detail && (
            <span className="block truncate text-[11px] text-sidebar-foreground/50">{current.detail}</span>
          )}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-sidebar-foreground/40" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{options.length > 1 ? "Tus empresas" : "Tu empresa"}</DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuItem key={option.id} disabled={option.id === current.id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.name}</span>
                {option.detail && (
                  <span className="block truncate text-xs font-normal text-muted-foreground">{option.detail}</span>
                )}
              </span>
              {option.id === current.id && <Check size={14} className={cn("text-primary")} />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {canSeeCompany && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(COMPANY_PATH)}>
              <Building2 size={14} /> Datos de la empresa
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
