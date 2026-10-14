/** Si una entrada del menú corresponde a la pantalla abierta. */
export function isNavItemActive(pathname: string, href: string, matchPrefix = false): boolean {
  if (pathname === href) return true;
  return matchPrefix && pathname.startsWith(`${href}/`);
}

/** Lo pendiente de un grupo cerrado: la suma de lo que muestran sus entradas. */
export function closedGroupBadge(items: readonly { badge?: number }[]): number {
  return items.reduce((total, item) => total + (item.badge ?? 0), 0);
}
