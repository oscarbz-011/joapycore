import { createElement } from 'react';
import type { LucideProps } from 'lucide-react';
import { moduleIcon } from '@/lib/module-catalog';

/** El ícono que el catálogo del backend nombra para un módulo. */
export function ModuleIcon({ name, ...props }: { name: string } & LucideProps) {
  return createElement(moduleIcon(name), props);
}
