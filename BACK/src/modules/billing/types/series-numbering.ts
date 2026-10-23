import { BillingModality } from '@prisma/client';

// Lo que una serie le copia a la factura al numerarla.
export interface SeriesNumbering {
  seriesId: string;
  modality: BillingModality;
  timbrado: string;
  timbradoValidFrom: Date | null;
  timbradoValidUntil: Date | null;
  serieCode: string;
  establecimiento: string;
  puntoExpedicion: string;
  sequential: number;
  invoiceNumber: string;
  invoicePrefix: string;
}
