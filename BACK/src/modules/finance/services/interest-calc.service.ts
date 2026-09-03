import { Injectable } from '@nestjs/common';
import { InterestComponentFrequency } from '@prisma/client';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_PERIOD = 30;

// Motor de cálculo puro (sin acceso a datos) compartido entre el scheduler
// de intereses/mora y el de detección de morosos — ambos necesitan la misma
// noción de "cuántos períodos de 30 días pasaron desde que venció la
// tolerancia". Se opera en timestamps directos (nunca setDate/getMonth
// locales) para no repetir el bug de timezone ya corregido en otras partes
// de finance/loans.service.ts.
@Injectable()
export class InterestCalcService {
  daysOverdue(dueDate: Date, graceDays: number, now: Date): number {
    const graceDeadline = new Date(dueDate.getTime() + graceDays * MS_PER_DAY);
    if (now <= graceDeadline) return 0;
    return Math.floor((now.getTime() - graceDeadline.getTime()) / MS_PER_DAY);
  }

  // Períodos completos de 30 días transcurridos desde que venció la
  // tolerancia — usado tanto por componentes MONTHLY como por el umbral de
  // Morosos ("meses de mora").
  periodsElapsed(dueDate: Date, graceDays: number, now: Date): number {
    const days = this.daysOverdue(dueDate, graceDays, now);
    return Math.floor(days / DAYS_PER_PERIOD);
  }

  // Cargo vigente de un componente sobre una cuota, en guaraníes — nunca
  // negativo, nunca depende de si ya se cobró algo (eso lo maneja quien
  // aplica el pago, no el cálculo).
  computeComponentCharge(
    component: {
      frequency: InterestComponentFrequency;
      percentage: number;
      cumulative: boolean;
    },
    installmentAmount: number,
    daysOverdue: number,
    periodsElapsed: number,
  ): number {
    const pct = component.percentage / 100;
    switch (component.frequency) {
      case 'ONE_TIME':
        return daysOverdue >= 1 ? installmentAmount * pct : 0;
      case 'DAILY':
        return daysOverdue >= 1 ? installmentAmount * pct * daysOverdue : 0;
      case 'MONTHLY':
        if (periodsElapsed < 1) return 0;
        // Acumulativo: mes 1=10%, mes 2=20%, mes 3=30% (lineal, no interés
        // compuesto) — cada período vencido vuelve a sumar el % base. No
        // acumulativo: se cobra el % base una sola vez y no vuelve a crecer.
        return component.cumulative
          ? installmentAmount * pct * periodsElapsed
          : installmentAmount * pct;
      default:
        return 0;
    }
  }
}
