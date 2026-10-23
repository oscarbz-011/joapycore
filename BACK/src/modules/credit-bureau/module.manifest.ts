import { defineModule } from '../../common/modules/module-manifest';

// Se enciende con CreditBureauConfig.isEnabled, dentro de Financiamiento.
export const creditBureauManifest = defineModule({
  key: 'credit-bureau',
  kind: 'feature',
  parent: 'finance',
  displayName: 'Buró de crédito',
  description: 'Consulta de antecedentes crediticios en un buró externo',
  icon: 'ShieldCheck',
  isStable: true,
  depends: ['finance'],
  owns: ['CreditBureauConfig', 'CreditBureauCheck'],
});
