import { buildHeaderHtml } from './pdf.service';

// PdfService.renderTemplate() lanza un Chromium real vía `puppeteer` (import
// dinámico — el paquete es ESM puro, `require()` no puede cargarlo, y Jest en
// modo CJS no puede ejecutar un `import()` real sin --experimental-vm-modules).
// Por eso acá solo se testea la lógica pura (armado del header); el render
// real end-to-end se verifica generando y descargando un PDF real vía API
// (mismo criterio ya usado para verificar la generación de contratos).
describe('buildHeaderHtml', () => {
  it('returns an empty string when neither logo nor company name are provided', () => {
    expect(buildHeaderHtml()).toBe('');
    expect(buildHeaderHtml({})).toBe('');
  });

  it('renders only the logo image when no company name is given', () => {
    const html = buildHeaderHtml({ logoDataUri: 'data:image/png;base64,abc' });
    expect(html).toContain('<img src="data:image/png;base64,abc" alt="Logo" />');
    expect(html).not.toContain('company-name');
  });

  it('renders only the company name when no logo is given', () => {
    const html = buildHeaderHtml({ companyName: 'Mi Empresa SA' });
    expect(html).toContain('<span class="company-name">Mi Empresa SA</span>');
    expect(html).not.toContain('<img');
  });

  it('renders both the logo and the company name when both are given', () => {
    const html = buildHeaderHtml({ logoDataUri: 'data:image/png;base64,abc', companyName: 'Mi Empresa SA' });
    expect(html).toContain('<img src="data:image/png;base64,abc" alt="Logo" />');
    expect(html).toContain('<span class="company-name">Mi Empresa SA</span>');
  });
});
