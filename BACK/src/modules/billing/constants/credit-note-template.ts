// Nota de crédito de impresión propia (A4). Mismo formato que la factura,
// con la factura que modifica: el art. 11 del Decreto 6539/05 la define como
// documento complementario de esa factura.
export const CREDIT_NOTE_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 24px; }
  @page { size: A4; margin: 0; }
  .company-header { display: flex; justify-content: space-between; gap: 16px; border: 1px solid #1e293b; margin-bottom: 12px; }
  .company-block { display: flex; gap: 12px; padding: 10px; flex: 1; }
  .company-logo { max-width: 160px; max-height: 56px; object-fit: contain; flex-shrink: 0; }
  .company-name { font-size: 15px; font-weight: 700; }
  .company-meta { font-size: 10.5px; color: #475569; margin-top: 2px; line-height: 1.4; }
  .doc-box { border-left: 1px solid #1e293b; padding: 10px 14px; min-width: 220px; text-align: center; }
  .doc-box .doc-title { font-size: 14px; font-weight: 700; }
  .doc-box .doc-number { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .doc-box .doc-meta { font-size: 10.5px; color: #475569; margin-top: 6px; text-align: left; }
  table.data-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .data-table th, .data-table td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; }
  .data-table th { background: #f8fafc; font-weight: 700; }
  .data-table td:nth-child(2) { text-align: center; }
  .data-table td:nth-child(n+3), .data-table th:nth-child(n+3) { text-align: right; }
  .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
</style>
</head>
<body>
  <div class="company-header">
    <div class="company-block">
      {{tenant.logo}}
      <div>
        <div class="company-name">{{tenant.razonSocial}}</div>
        <div class="company-meta">{{tenant.actividad}}</div>
        <div class="company-meta">{{tenant.direccion}}</div>
        <div class="company-meta">Tel: {{tenant.telefono}}</div>
        <div class="company-meta">RUC: {{tenant.ruc}}</div>
      </div>
    </div>
    <div class="doc-box">
      <div class="doc-title">NOTA DE CRÉDITO</div>
      <div class="doc-number">NRO.: {{nota.numero}}</div>
      <div class="doc-meta">
        <div><strong>TIMBRADO NRO.:</strong> {{timbrado.numero}}</div>
        <div><strong>Inicio Vigencia:</strong> {{timbrado.inicioVigencia}}</div>
        <div><strong>Fin Vigencia:</strong> {{timbrado.finVigencia}}</div>
      </div>
    </div>
  </div>

  <div style="border:1px solid #1e293b;border-top:none;padding:8px 10px;margin-bottom:12px;font-size:11px">
    <div><strong>FECHA DE EMISIÓN:</strong> {{nota.fechaEmision}}</div>
    <div><strong>SEÑOR(ES):</strong> {{cliente.nombre}}</div>
    <div><strong>DIRECCIÓN:</strong> {{cliente.direccion}}</div>
    <div><strong>RUC/CI:</strong> {{cliente.documento}}</div>
    <div><strong>COMPROBANTE QUE MODIFICA:</strong> {{nota.facturaModificada}}</div>
    <div><strong>MOTIVO:</strong> {{nota.motivo}}</div>
  </div>

  {{nota.items}}

  <div style="margin-top:14px;display:flex;justify-content:space-between;gap:16px;font-size:11px">
    <div style="flex:1">
      <div class="label">Subtotales</div>
      <div>Exentas: Gs. {{nota.subtotalExentas}} &nbsp;&nbsp; 5%: Gs. {{nota.subtotal5}} &nbsp;&nbsp; 10%: Gs. {{nota.subtotal10}}</div>
      <div class="label" style="margin-top:8px">Liquidación del I.V.A.</div>
      <div>(5%) = Gs. {{nota.iva5}} &nbsp;&nbsp; (10%) = Gs. {{nota.iva10}}</div>
      <div><strong>TOTAL I.V.A.:</strong> Gs. {{nota.totalIva}}</div>
    </div>
    <div style="flex:1;text-align:right">
      <div class="label">Total (en letras)</div>
      <div>GUARANÍES: {{nota.totalEnLetras}}.-</div>
      <div style="font-size:16px;font-weight:700;margin-top:4px">Gs. {{nota.total}}</div>
    </div>
  </div>

  <div style="margin-top:56px;display:flex;justify-content:space-around">
    <div style="border-top:1px solid #94a3b8;width:180px;text-align:center;padding-top:6px;font-size:11px;color:#64748b">Firma del cliente</div>
    <div style="border-top:1px solid #94a3b8;width:180px;text-align:center;padding-top:6px;font-size:11px;color:#64748b">Firma y sello empresa</div>
  </div>
</body>
</html>`;
