import { defineModule } from '../../common/modules/module-manifest';

export const hrManifest = defineModule({
  key: 'hr',
  kind: 'addon',
  displayName: 'Recursos Humanos',
  description: 'Empleados, licencias y procesamiento de nómina',
  icon: 'Users',
  isStable: true,
  depends: [],
  owns: [
    'Area',
    'Position',
    'Employee',
    'Leave',
    'LeaveBalance',
    'PayrollConfig',
    'PayrollRecord',
    'PayrollRecordItem',
  ],
});
