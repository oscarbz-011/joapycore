import type { LucideIcon } from 'lucide-react';
import type { SlotContributions } from './slot-types';

/** Una entrada de primer nivel del menú lateral. */
export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Posición en el menú: menor va más arriba. */
  order: number;
  /** Va abajo, separada del resto (Empresa, Sistema…). */
  bottom?: boolean;
  /** Enlace directo a su única entrada, sin desplegable. */
  flat?: boolean;
  /** Cerrada, muestra la suma de lo pendiente de sus entradas. */
  badgeWhenClosed?: boolean;
  /** Una entrada también está activa en sus pantallas internas. */
  matchPrefix?: boolean;
}

export interface NavEntry {
  section: string;
  label: string;
  href: string;
  /** Todavía sin pantalla: se muestra apagada. */
  stub?: boolean;
  /**
   * Además de poder abrir `href`. Para entradas cuya ruta es más amplia que
   * la entrada (la raíz de Ajustes) o que no tienen ruta (las apagadas).
   */
  anyPermission?: string[];
  modules?: string[];
}

export interface ModuleRoute {
  prefix: string;
  /** Alcanza con tener uno de estos permisos. */
  anyPermission?: string[];
}

export interface FrontModuleManifest {
  id: string;
  /**
   * Clave del módulo en el backend. Sus rutas, entradas y aportes exigen que
   * esté activo. Sin clave, el manifiesto es de la plataforma y no se apaga.
   */
  module?: string;
  sections?: NavSection[];
  nav?: NavEntry[];
  routes?: ModuleRoute[];
  /** Su pantalla de configuración, enlazada desde Ajustes → Módulos. */
  settingsHref?: string;
  /** Lo que agrega en pantallas de otros módulos. Ver slot-types.ts. */
  slots?: SlotContributions;
}
