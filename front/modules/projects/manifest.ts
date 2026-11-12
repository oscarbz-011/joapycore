import { FolderKanban } from 'lucide-react';
import type { FrontModuleManifest } from '../types';

// Anunciado en el catálogo, todavía sin pantallas.
export const projectsManifest: FrontModuleManifest = {
  id: 'projects',
  module: 'projects',
  sections: [{ id: 'projects', label: 'Proyectos', icon: FolderKanban, order: 140 }],
  nav: [
    'Proyectos',
    'Tareas',
    'Timesheet',
    'Asignación de recursos',
    'Hitos',
  ].map((label) => ({ section: 'projects', label, href: '#', stub: true })),
};
