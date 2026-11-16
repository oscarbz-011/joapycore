import { Boxes } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

// Anunciado en el catálogo, todavía sin pantallas.
export const assetsManifest: FrontModuleManifest = {
  id: 'assets',
  module: 'assets',
  sections: [{ id: 'assets', label: 'Activos Fijos', icon: Boxes, order: 160 }],
  nav: [
    'Registro de activos',
    'Asignaciones',
    'Mantenimiento',
    'Desecho',
  ].map((label) => ({ section: 'assets', label, href: '#', stub: true })),
};
