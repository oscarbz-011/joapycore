// Nota de remisión de impresión propia (A4). Cada ejemplar va en su propia
// hoja con la leyenda de su destino (arts. 32 inc. 9 y 48 del Decreto
// 6539/05); la copia del transportista solo cuando el flete es contratado.
export const REMISSION_COPIES = {
  original: 'ORIGINAL: DESTINATARIO',
  sender: 'COPIA: REMITENTE',
  tax: 'COPIA: ADMINISTRACIÓN TRIBUTARIA',
  carrier: 'COPIA: TRANSPORTISTA',
} as const;

const STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; }
  @page { size: A4; margin: 0; }
  .page { padding: 20px 24px; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .company-header { display: flex; justify-content: space-between; border: 1px solid #1e293b; }
  .company-block { display: flex; gap: 12px; padding: 10px; flex: 1; }
  .company-logo { max-width: 150px; max-height: 52px; object-fit: contain; flex-shrink: 0; }
  .company-name { font-size: 14px; font-weight: 700; }
  .company-meta { font-size: 10px; color: #475569; margin-top: 2px; line-height: 1.35; }
  .doc-box { border-left: 1px solid #1e293b; padding: 10px 14px; min-width: 220px; text-align: center; }
  .doc-title { font-size: 14px; font-weight: 700; }
  .doc-number { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .doc-meta { font-size: 10px; color: #475569; margin-top: 6px; text-align: left; }
  .copy { border: 1px solid #1e293b; border-top: none; padding: 4px 10px; font-weight: 700; text-align: right; letter-spacing: .04em; }
  .box { border: 1px solid #1e293b; border-top: none; padding: 7px 10px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 16px; }
  .section { font-size: 9.5px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3px; font-weight: 700; }
  .row { line-height: 1.5; }
  table.data-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .data-table th, .data-table td { border: 1px solid #94a3b8; padding: 4px 6px; text-align: left; vertical-align: top; }
  .data-table th { background: #f1f5f9; font-weight: 700; }
  .data-table td:first-child, .data-table th:first-child { text-align: right; width: 60px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 46px; text-align: center; font-size: 10px; }
  .signatures div { border-top: 1px solid #1e293b; padding-top: 4px; }
`;

const page = (copy: string) => `
<div class="page">
  <div class="company-header">
    <div class="company-block">
      {{tenant.logo}}
      <div>
        <div class="company-name">{{tenant.razonSocial}}</div>
        <div class="company-meta">{{tenant.actividad}}</div>
        <div class="company-meta">{{tenant.direccion}}</div>
        <div class="company-meta">{{tenant.sucursal}}</div>
        <div class="company-meta">Tel: {{tenant.telefono}}</div>
      </div>
    </div>
    <div class="doc-box">
      <div class="doc-title">NOTA DE REMISIÓN</div>
      <div class="doc-number">N° {{nota.numero}}</div>
      <div class="doc-meta">
        <div><strong>RUC:</strong> {{tenant.ruc}}</div>
        <div><strong>TIMBRADO N°:</strong> {{timbrado.numero}}</div>
        <div><strong>Inicio de vigencia:</strong> {{timbrado.inicioVigencia}}</div>
        <div><strong>Fin de vigencia:</strong> {{timbrado.finVigencia}}</div>
      </div>
    </div>
  </div>
  <div class="copy">${copy}</div>

  <div class="box grid">
    <div class="row"><strong>Fecha de emisión:</strong> {{nota.fechaEmision}}</div>
    <div class="row"><strong>Motivo del traslado:</strong> {{nota.motivo}}</div>
    <div class="row"><strong>Destinatario:</strong> {{destinatario.nombre}}</div>
    <div class="row"><strong>RUC / CI:</strong> {{destinatario.documento}}</div>
    <div class="row" style="grid-column: span 2"><strong>Comprobante de venta:</strong> {{nota.comprobante}}</div>
  </div>

  <div class="box grid">
    <div>
      <div class="section">Punto de partida</div>
      <div class="row">{{partida.direccion}}</div>
      <div class="row">{{partida.ciudad}} — {{partida.departamento}}</div>
    </div>
    <div>
      <div class="section">Punto de llegada</div>
      <div class="row">{{llegada.direccion}}</div>
      <div class="row">{{llegada.ciudad}} — {{llegada.departamento}}</div>
    </div>
  </div>

  <div class="box grid">
    <div class="row"><strong>Inicio del traslado:</strong> {{traslado.inicio}}</div>
    <div class="row"><strong>Fin del traslado:</strong> {{traslado.fin}}</div>
  </div>

  <div class="box grid3">
    <div>
      <div class="section">Vehículo</div>
      <div class="row"><strong>Marca:</strong> {{vehiculo.marca}}</div>
      <div class="row"><strong>Chapa / RUA:</strong> {{vehiculo.chapa}}</div>
      <div class="row">{{vehiculo.remolque}}</div>
    </div>
    <div>
      <div class="section">Transportista</div>
      <div class="row">{{transportista.nombre}}</div>
      <div class="row"><strong>RUC:</strong> {{transportista.ruc}}</div>
      <div class="row"><strong>Domicilio fiscal:</strong> {{transportista.domicilio}}</div>
    </div>
    <div>
      <div class="section">Conductor</div>
      <div class="row">{{conductor.nombre}}</div>
      <div class="row"><strong>CI:</strong> {{conductor.documento}}</div>
      <div class="row"><strong>Dirección:</strong> {{conductor.direccion}}</div>
    </div>
  </div>

  {{nota.items}}

  <div class="row" style="margin-top:8px"><strong>Observaciones:</strong> {{nota.observaciones}}</div>

  <div class="signatures">
    <div>Firma del conductor</div>
    <div>Recibí conforme (destinatario)</div>
  </div>
</div>`;

export function remissionNoteTemplate(copies: readonly string[]): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>${STYLE}</style>
</head>
<body>${copies.map(page).join('')}
</body>
</html>`;
}
