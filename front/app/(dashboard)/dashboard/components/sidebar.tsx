"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "../../../../lib/auth-context";
import { alertsApi } from "../../../../lib/api/alerts";
import { useActiveModules } from "../../../../lib/use-active-modules";
import { usePendingNotifications } from "../../../../lib/use-pending-notifications";
import { CompanySwitcher, JoapyCoreBrand } from "./company-switcher";
import { closedGroupBadge, isNavItemActive } from "@/lib/sidebar-nav";
import { COMMUNICATIONS_PATH } from "@/lib/api/communications";
import { useCommunicationsAttention } from "@/components/communications/inbox/use-communications";
import { CHAT_PATH, useChatUnread } from "@/components/chat/use-chat";
import { buildNavigation, type NavGroup } from "@/modules/navigation";

// ── ModuleGroup ────────────────────────────────────────────────────────────────

function ModuleGroup({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  const visibleItems = group.items;

  const hasActive = visibleItems.some(
    (item) =>
      !item.stub &&
      item.href !== "#" &&
      isNavItemActive(pathname, item.href, group.matchPrefix),
  );

  const [open, setOpen] = useState(hasActive);
  const Icon = group.icon;
  const closedBadge = group.badgeWhenClosed ? closedGroupBadge(visibleItems) : 0;

  if (visibleItems.length === 0) return null;

  if (group.flat) {
    const item = visibleItems[0];
    const isActive = !item.stub && item.href !== "#" && pathname === item.href;
    return (
      <Link
        href={item.href}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[9px] px-3 py-[7px] text-[13.5px] font-medium no-underline transition-colors",
          isActive
            ? "bg-sidebar-primary/15 text-sidebar-primary"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon size={15} className="shrink-0 opacity-75" />
        <span className="flex-1 text-left">{group.label}</span>
        {!!item.badge && (
          <span className="rounded-full bg-red-500/20 px-1.5 py-px text-[11px] font-bold leading-none text-red-400">
            {item.badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[9px] border-0 px-3 py-[7px] text-[13.5px] font-medium",
          "cursor-pointer bg-transparent transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          hasActive ? "text-sidebar-foreground" : "text-sidebar-foreground/60",
        )}
      >
        <Icon size={15} className="shrink-0 opacity-75" />
        <span className="flex-1 text-left">{group.label}</span>
        {!open && closedBadge > 0 && (
          <span className="rounded-full bg-red-500/20 px-1.5 py-px text-[11px] font-bold leading-none text-red-400">
            {closedBadge}
          </span>
        )}
        <ChevronDown
          size={12}
          className={cn(
            "shrink-0 text-sidebar-foreground/30 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-px flex flex-col gap-px pl-2.5">
          {visibleItems.map((item) => {
            const isActive =
              !item.stub &&
              item.href !== "#" &&
              isNavItemActive(pathname, item.href, group.matchPrefix);

            if (item.stub) {
              return (
                <div
                  key={item.label}
                  className="flex cursor-default select-none items-center gap-2.5 rounded-[7px] px-3 py-[5.5px] text-[13px] text-sidebar-foreground/30"
                >
                  <span className="size-1 shrink-0 rounded-full bg-sidebar-foreground/20" />
                  {item.label}
                </div>
              );
            }

            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[7px] px-3 py-[5.5px] text-[13px] no-underline transition-colors",
                  isActive
                    ? "bg-sidebar-primary/15 font-semibold text-sidebar-primary"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1 shrink-0 rounded-full transition-colors",
                    isActive
                      ? "bg-sidebar-primary"
                      : "bg-sidebar-foreground/20",
                  )}
                />
                <span className="flex-1">{item.label}</span>
                {!!item.badge && (
                  <span className="rounded-full bg-red-500/20 px-1.5 py-px text-[11px] font-bold leading-none text-red-400">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { jwtPayload } = useAuth();

  const permissions = jwtPayload?.permissions ?? [];

  // En vivo, no del JWT — ver useActiveModules.
  const { activeModules } = useActiveModules();

  const { data: alertConfigs = [] } = useQuery({
    queryKey: ["alert-configs"],
    queryFn: alertsApi.getConfigs,
    enabled:
      permissions.includes("alerts:read") ||
      permissions.includes("alerts:manage"),
  });
  const alertBadge = alertConfigs.filter((c) => c.isActive).length || undefined;

  const { counts: pendingCounts } = usePendingNotifications(
    permissions,
    activeModules,
    jwtPayload?.sub,
  );

  const communications = useCommunicationsAttention();
  const chatUnread = useChatUnread();

  const badgeByHref: Record<string, number | undefined> = {
    [COMMUNICATIONS_PATH]: communications.total || undefined,
    [CHAT_PATH]: chatUnread || undefined,
    "/dashboard/settings/alerts": alertBadge,
    "/dashboard/billing": pendingCounts.invoices,
    "/dashboard/billing/approvals": pendingCounts.approvals,
    "/dashboard/payments": pendingCounts.overdueAR,
    "/dashboard/sales": pendingCounts.myAdjustments,
    "/dashboard/procurement": pendingCounts.overduePOs,
    "/dashboard/logistics/deliveries": pendingCounts.pendingDeliveries,
  };

  const isDashActive = pathname === "/dashboard";

  const groups = buildNavigation(activeModules, permissions).map((g) => ({
    ...g,
    items: g.items.map((item) =>
      item.href in badgeByHref
        ? { ...item, badge: badgeByHref[item.href] }
        : item,
    ),
  }));
  const mainGroups = groups.filter((g) => !g.bottom);
  const bottomGroups = groups.filter((g) => g.bottom);

  return (
    <aside className="fixed inset-y-0 left-0 flex w-[250px] flex-col border-r ">
      {/* Brand */}
      <div className="shrink-0 space-y-3 px-3 pb-3 pt-[18px]">
        <div className="px-1.5">
          <JoapyCoreBrand />
        </div>
        <CompanySwitcher />
      </div>

      {/* Scrollable nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5">
        <Link
          href="/dashboard"
          className={cn(
            "mb-1 flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[13.5px] font-medium no-underline transition-colors",
            isDashActive
              ? "bg-sidebar-primary/15 font-semibold text-sidebar-primary"
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <LayoutDashboard size={15} className="shrink-0 opacity-75" />
          <span>Dashboard</span>
        </Link>

        <div className="flex flex-col gap-px">
          {mainGroups.map((group) => (
            <ModuleGroup key={group.id} group={group} />
          ))}
        </div>
      </nav>

      {/* Bottom groups */}
      {bottomGroups.length > 0 && (
        <div className="flex shrink-0 flex-col gap-px border-t border-sidebar-border px-3 py-2">
          {bottomGroups.map((group) => (
            <ModuleGroup key={group.id} group={group} />
          ))}
        </div>
      )}
    </aside>
  );
}
