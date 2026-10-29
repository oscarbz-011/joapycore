/** Imprime un documento HTML desde un iframe oculto, sin salir de la pantalla. */
export function printHtmlDocument(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  // Si el navegador no avisa que terminó de imprimir, el iframe no queda colgado.
  const cleanup = window.setTimeout(() => frame.remove(), 60_000);
  win.addEventListener('afterprint', () => {
    window.clearTimeout(cleanup);
    frame.remove();
  });
  doc.open();
  doc.write(html);
  doc.close();
  // Imprimir recién cuando el contenido se dibujó; antes, algunos navegadores
  // sacan la hoja en blanco.
  win.requestAnimationFrame(() => {
    win.focus();
    win.print();
  });
}

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
