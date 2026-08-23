// Los archivos van protegidos por Bearer token (no por cookie), así que un
// <a href> o window.open directo al endpoint de descarga siempre da 401.
// Estos helpers bajan el blob autenticado vía axios y lo entregan al navegador.

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Abre el blob en una nueva pestaña usando el visor nativo del navegador
// (permite imprimir desde ahí) en vez de forzar la descarga.
export function openBlobInNewTab(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
