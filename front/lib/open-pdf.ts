import { filesApi } from './api/files';

// Abre en una pestaña nueva el PDF generado en el servidor (factura o
// recibo) — mismo patrón ya usado para descargar el logo del tenant:
// blob autenticado + object URL (un enlace directo al endpoint no
// funcionaría porque requiere el header Authorization).
export async function openPdf(fileId: string): Promise<void> {
  const blob = await filesApi.downloadBlob(fileId);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
