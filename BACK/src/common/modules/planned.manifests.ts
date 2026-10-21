import { defineModule } from './module-manifest';

// Anunciados en el catálogo como "Próximamente", todavía sin código. Cuando
// tengan carpeta en modules/, su manifiesto se mueve ahí.

export const crmManifest = defineModule({
  key: 'crm',
  kind: 'addon',
  displayName: 'CRM',
  description: 'Gestión de contactos, leads, deals y campañas comerciales',
  icon: 'Network',
  isStable: false,
  depends: ['sales'],
  owns: [],
});

export const projectsManifest = defineModule({
  key: 'projects',
  kind: 'addon',
  displayName: 'Proyectos',
  description:
    'Gestión de proyectos, tareas, timesheet y asignación de recursos',
  icon: 'FolderKanban',
  isStable: false,
  depends: [],
  owns: [],
});

export const assetsManifest = defineModule({
  key: 'assets',
  kind: 'addon',
  displayName: 'Activos Fijos',
  description: 'Registro, asignación y mantenimiento de activos empresariales',
  icon: 'Boxes',
  isStable: false,
  depends: [],
  owns: [],
});
