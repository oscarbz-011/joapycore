import { describe, expect, it } from 'vitest';
import {
  STANDARD_PREPRINTED_LAYOUT,
  preprintedFormHtml,
  sampleFiscalReceipt,
} from './preprinted-form';

const layout = STANDARD_PREPRINTED_LAYOUT;

describe('preprintedFormHtml', () => {
  it('sizes the page to the talonario sheet without margins', () => {
    const html = preprintedFormHtml(sampleFiscalReceipt(), { ...layout, pageWidth: 210, pageHeight: 150 });
    expect(html).toContain('@page { size: 210mm 150mm; margin: 0; }');
  });

  it('prints only the variable data, not the company data printed on the sheet', () => {
    const receipt = { ...sampleFiscalReceipt(), issuer: { ...sampleFiscalReceipt().issuer, name: 'Mi Empresa S.A.', ruc: '80069563-1' } };
    const html = preprintedFormHtml(receipt, layout);

    expect(html).toContain('NOMBRE O RAZÓN SOCIAL DE PRUEBA');
    expect(html).toContain('RUC 80000000-0');
    expect(html).not.toContain('Mi Empresa S.A.');
    expect(html).not.toContain('80069563-1');
    expect(html).not.toContain('001-001-0000000</div>');
  });

  it('places each datum where the series says, plus the calibration offset', () => {
    const html = preprintedFormHtml(sampleFiscalReceipt(), {
      ...layout,
      offsetX: 2,
      offsetY: -1,
      buyerName: { x: 40, y: 50 },
    });
    expect(html).toContain('left:42mm;top:49mm;">NOMBRE O RAZÓN SOCIAL DE PRUEBA');
  });

  it('puts each line total in the column of its IVA rate, right aligned', () => {
    const html = preprintedFormHtml(sampleFiscalReceipt(), layout);
    // taxed10X 205 → caja de 60 mm que termina en 205 mm, primera línea en top 66.
    expect(html).toContain('class="amount" style="left:145mm;top:66mm;width:60mm">220.000');
    expect(html).toContain('class="amount" style="left:120mm;top:71mm;width:60mm">52.500');
    expect(html).toContain('class="amount" style="left:95mm;top:76mm;width:60mm">30.000');
  });

  it('marks cash or credit sales', () => {
    const cash = preprintedFormHtml(sampleFiscalReceipt(), layout);
    expect(cash).toContain('left:150mm;top:38mm;">X');
    const credit = preprintedFormHtml({ ...sampleFiscalReceipt(), condition: 'CRÉDITO' }, layout);
    expect(credit).toContain('left:180mm;top:38mm;">X');
  });

  it('writes the total in words and the IVA liquidation', () => {
    const html = preprintedFormHtml(sampleFiscalReceipt(), layout);
    expect(html).toContain('GUARANÍES TRESCIENTOS DOS MIL QUINIENTOS');
    expect(html).toContain('>22.500<');
    expect(html).toContain('>302.500<');
  });

  it('never prints more lines than the sheet has', () => {
    const html = preprintedFormHtml(sampleFiscalReceipt(), {
      ...layout,
      items: { ...layout.items, maxLines: 1 },
    });
    expect(html).toContain('PRODUCTO GRAVADO 10%');
    expect(html).not.toContain('PRODUCTO EXENTO');
  });

  it('escapes text that comes from the catalog', () => {
    const receipt = sampleFiscalReceipt();
    receipt.lines[0] = { ...receipt.lines[0], description: 'Licuadora <Pro>' };
    const html = preprintedFormHtml(receipt, layout);
    expect(html).toContain('Licuadora &lt;Pro&gt;');
    expect(html).not.toContain('<Pro>');
  });
});
