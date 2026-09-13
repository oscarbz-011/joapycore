// Cabeceras para servir archivos subidos por usuarios sin abrir la puerta a
// XSS almacenado: un .html o .svg subido con su tipo MIME real, servido
// "inline" desde el origen de la API, ejecuta scripts en ese origen.

// Tipos que el navegador muestra sin ejecutar nada: se pueden abrir en línea
// (vista previa de PDF y de imágenes en el front).
const INLINE_SAFE = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
]);

export interface DownloadHeaders {
  contentType: string;
  contentDisposition: string;
}

export function downloadHeaders(
  mimeType: string | null | undefined,
  originalName: string,
): DownloadHeaders {
  const mime = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  const inline = INLINE_SAFE.has(mime);
  return {
    // Todo lo demás se descarga como binario: el navegador no lo interpreta.
    contentType: inline ? mime : 'application/octet-stream',
    contentDisposition: contentDisposition(
      inline ? 'inline' : 'attachment',
      originalName,
    ),
  };
}

/**
 * Content-Disposition según RFC 6266 / RFC 5987: `filename` ASCII de respaldo
 * (sin comillas, barras ni caracteres de control, que podían romper la
 * cabecera) y `filename*` con el nombre real en UTF-8.
 */
export function contentDisposition(
  type: 'inline' | 'attachment',
  filename: string,
): string {
  const name = filename.replace(/[\r\n"\\/]/g, '_').trim() || 'archivo';
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
