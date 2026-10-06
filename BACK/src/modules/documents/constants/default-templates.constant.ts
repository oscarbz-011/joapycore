// Plantillas de respaldo embebidas: se usan cuando el tenant todavía no creó
// su propia plantilla de factura/recibo desde el editor de Documentos. En
// cuanto el tenant crea/edita una (TemplateKind.INVOICE / PAYMENT_RECEIPT),
// esa pasa a tener prioridad — ver findTemplate() en DocumentsRepository.
//
// HTML/CSS crudo (no TipTap): factura y recibo son formularios de grilla con
// requisitos de layout (columnas exactas, encabezado bicolumna con borde,
// firma posicionada) que el editor WYSIWYG no puede dar. El contrato de
// venta (SALE_CONTRACT) es prosa y sigue en TipTap — ver
// sale-contract-on-invoice.listener.ts.

const SHARED_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 24px; }
  .company-header { display: flex; justify-content: space-between; gap: 16px; border: 1px solid #1e293b; margin-bottom: 12px; }
  .company-block { display: flex; gap: 12px; padding: 10px; flex: 1; }
  .company-logo { max-width: 160px; max-height: 56px; object-fit: contain; flex-shrink: 0; }
  .company-name { font-size: 15px; font-weight: 700; }
  .company-meta { font-size: 10.5px; color: #475569; margin-top: 2px; line-height: 1.4; }
  .doc-box { border-left: 1px solid #1e293b; padding: 10px 14px; min-width: 220px; text-align: center; }
  .doc-box .doc-title { font-size: 14px; font-weight: 700; }
  .doc-box .doc-number { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .doc-box .doc-meta { font-size: 10.5px; color: #475569; margin-top: 6px; text-align: left; }
  .doc-box .doc-meta div { margin-top: 1px; }
  table.data-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .data-table th, .data-table td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; }
  .data-table th { background: #f8fafc; font-weight: 700; }
  .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; }
`;

export const DEFAULT_INVOICE_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  ${SHARED_STYLES}
  @page { size: A4; margin: 0; }
  .data-table td:nth-child(4), .data-table td:nth-child(5), .data-table td:nth-child(6),
  .data-table th:nth-child(4), .data-table th:nth-child(5), .data-table th:nth-child(6) { text-align: right; }
  .data-table td:nth-child(2) { text-align: center; }
</style>
</head>
<body>
  <div class="company-header">
    <div class="company-block">
      {{tenant.logo}}
      <div>
        <div class="company-name">{{tenant.razonSocial}}</div>
        <div class="company-meta">{{tenant.direccion}} — {{tenant.ciudad}}</div>
        <div class="company-meta">Tel: {{tenant.telefono}}</div>
        <div class="company-meta">RUC: {{tenant.ruc}}</div>
      </div>
    </div>
    <div class="doc-box">
      <div class="doc-title">FACTURA</div>
      <div class="doc-number">NRO.: {{factura.numero}}</div>
      <div class="doc-meta">
        <div><strong>TIMBRADO NRO.:</strong> {{timbrado.numero}}</div>
        <div><strong>Inicio Vigencia:</strong> {{timbrado.inicioVigencia}}</div>
        <div><strong>Fin Vigencia:</strong> {{timbrado.finVigencia}}</div>
      </div>
    </div>
  </div>

  <div style="border:1px solid #1e293b;border-top:none;padding:8px 10px;margin-bottom:12px;font-size:11px">
    <div><strong>FECHA DE EMISIÓN:</strong> {{factura.fechaEmision}}</div>
    <div><strong>SEÑOR(ES):</strong> {{cliente.nombre}}</div>
    <div><strong>DIRECCIÓN:</strong> {{cliente.direccion}}</div>
    <div><strong>RUC/CI:</strong> {{cliente.documento}} &nbsp;&nbsp; <strong>COD. CLIENTE:</strong> {{cliente.codigo}}</div>
    <div><strong>COND. DE VENTA:</strong> {{factura.condicionVenta}}</div>
  </div>

  {{factura.items}}

  <div style="margin-top:14px;display:flex;justify-content:space-between;gap:16px;font-size:11px">
    <div style="flex:1">
      <div class="label">Subtotales</div>
      <div>Exentas: Gs. {{factura.subtotalExentas}} &nbsp;&nbsp; 5%: Gs. {{factura.subtotal5}} &nbsp;&nbsp; 10%: Gs. {{factura.subtotal10}}</div>
      <div class="label" style="margin-top:8px">Liquidación del I.V.A.</div>
      <div>(5%) = Gs. {{factura.iva5}} &nbsp;&nbsp; (10%) = Gs. {{factura.iva10}}</div>
      <div><strong>TOTAL I.V.A.:</strong> Gs. {{factura.totalIva}}</div>
    </div>
    <div style="flex:1;text-align:right">
      <div class="label">Total a pagar (en letras)</div>
      <div>GUARANIES: {{factura.totalEnLetras}}.-</div>
      <div style="font-size:16px;font-weight:700;margin-top:4px">Gs. {{factura.total}}</div>
    </div>
  </div>

  <div style="margin-top:56px;display:flex;justify-content:space-around">
    <div style="border-top:1px solid #94a3b8;width:180px;text-align:center;padding-top:6px;font-size:11px;color:#64748b">Firma del cliente</div>
    <div style="border-top:1px solid #94a3b8;width:180px;text-align:center;padding-top:6px;font-size:11px;color:#64748b">Firma y sello empresa</div>
  </div>
</body>
</html>`;

export const DEFAULT_PAYMENT_RECEIPT_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  ${SHARED_STYLES}
  @page { size: 21.5cm 14cm; margin: 0; }
  .data-table td:nth-child(1) { text-align: center; }
  .data-table td:nth-child(3), .data-table th:nth-child(3) { text-align: right; }
</style>
</head>
<body>
  <div class="company-header">
    <div class="company-block">
      {{tenant.logo}}
      <div>
        <div class="company-name">{{tenant.razonSocial}}</div>
        <div class="company-meta">{{tenant.direccion}}</div>
        <div class="company-meta">Tel: {{tenant.telefono}} &nbsp;&nbsp; RUC: {{tenant.ruc}}</div>
      </div>
    </div>
    <div class="doc-box">
      <div class="doc-title">RECIBO DE DINERO</div>
      <div class="doc-number">NRO.: {{recibo.numero}}</div>
    </div>
  </div>

  <div style="border:1px solid #1e293b;border-top:none;padding:10px;margin-bottom:12px;font-size:12px">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <strong>{{recibo.ciudad}}</strong>
      <span>{{recibo.fecha}}</span>
      <strong>Gs. {{recibo.total}}</strong>
    </div>
    <div>Recibí(mos) de: <strong>{{cliente.nombre}}</strong></div>
    <div>{{cliente.documento}} &nbsp;&nbsp; Cód. Cliente: {{cliente.codigo}}</div>
    <div style="margin-top:6px">la cantidad de GUARANIES:</div>
    <div style="border-bottom:1px dashed #94a3b8;padding-bottom:4px;font-weight:700">{{recibo.montoEnLetras}}.-</div>
  </div>

  <div style="font-size:11px;margin-bottom:4px">en concepto de las cuotas detalladas a continuación:</div>
  {{recibo.items}}

  <div style="margin-top:16px;font-size:12px">
    <div class="label" style="margin-bottom:4px">Forma de pago: {{recibo.formaDePago}}</div>
  </div>

  <div style="margin-top:40px;display:flex;justify-content:center">
    <div style="border-top:1px solid #94a3b8;width:220px;text-align:center;padding-top:6px;font-size:11px;color:#64748b">
      Firma del Cobrador<br/>{{recibo.cobrador}}
    </div>
  </div>
</body>
</html>`;

export const DEFAULT_INTEREST_INVOICE_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  ${SHARED_STYLES}
  @page { size: A4; margin: 0; }
  .data-table td:nth-child(4), .data-table td:nth-child(5), .data-table td:nth-child(6),
  .data-table th:nth-child(4), .data-table th:nth-child(5), .data-table th:nth-child(6) { text-align: right; }
  .data-table td:nth-child(2) { text-align: center; }
</style>
</head>
<body>
  <div class="company-header">
    <div class="company-block">
      {{tenant.logo}}
      <div>
        <div class="company-name">{{tenant.razonSocial}}</div>
        <div class="company-meta">{{tenant.direccion}} — {{tenant.ciudad}}</div>
        <div class="company-meta">Tel: {{tenant.telefono}}</div>
        <div class="company-meta">RUC: {{tenant.ruc}}</div>
      </div>
    </div>
    <div class="doc-box">
      <div class="doc-title">FACTURA</div>
      <div class="doc-number">NRO.: {{factura.numero}}</div>
      <div class="doc-meta">
        <div><strong>TIMBRADO NRO.:</strong> {{timbrado.numero}}</div>
        <div><strong>Inicio Vigencia:</strong> {{timbrado.inicioVigencia}}</div>
        <div><strong>Fin Vigencia:</strong> {{timbrado.finVigencia}}</div>
      </div>
    </div>
  </div>

  <div style="border:1px solid #1e293b;border-top:none;padding:8px 10px;margin-bottom:12px;font-size:11px">
    <div><strong>FECHA DE EMISIÓN:</strong> {{factura.fechaEmision}}</div>
    <div><strong>SEÑOR(ES):</strong> {{cliente.nombre}}</div>
    <div><strong>RUC/CI:</strong> {{cliente.documento}} &nbsp;&nbsp; <strong>COD. CLIENTE:</strong> {{cliente.codigo}}</div>
    <div><strong>RECIBO DE ORIGEN:</strong> {{factura.reciboOrigen}}</div>
  </div>

  {{factura.items}}

  <div style="margin-top:14px;display:flex;justify-content:space-between;gap:16px;font-size:11px">
    <div style="flex:1">
      <div class="label">Subtotales</div>
      <div>Exentas: Gs. {{factura.subtotalExentas}} &nbsp;&nbsp; 5%: Gs. {{factura.subtotal5}} &nbsp;&nbsp; 10%: Gs. {{factura.subtotal10}}</div>
      <div class="label" style="margin-top:8px">Liquidación del I.V.A.</div>
      <div>(5%) = Gs. {{factura.iva5}} &nbsp;&nbsp; (10%) = Gs. {{factura.iva10}}</div>
      <div><strong>TOTAL I.V.A.:</strong> Gs. {{factura.totalIva}}</div>
    </div>
    <div style="flex:1;text-align:right">
      <div class="label">Total a pagar (en letras)</div>
      <div>GUARANIES: {{factura.totalEnLetras}}.-</div>
      <div style="font-size:16px;font-weight:700;margin-top:4px">Gs. {{factura.total}}</div>
    </div>
  </div>
</body>
</html>`;

export const DEFAULT_QUOTE_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  ${SHARED_STYLES}
  @page { size: A4; margin: 0; }
  .data-table td:first-child { white-space: pre-line; }
  .data-table td:nth-child(2) { text-align: center; }
  .data-table td:nth-child(3), .data-table td:nth-child(4),
  .data-table th:nth-child(3), .data-table th:nth-child(4) { text-align: right; }
</style>
</head>
<body>
  <div class="company-header">
    <div class="company-block">
      {{tenant.logo}}
      <div>
        <div class="company-name">{{tenant.razonSocial}}</div>
        <div class="company-meta">{{tenant.direccion}} — {{tenant.ciudad}}</div>
        <div class="company-meta">Tel: {{tenant.telefono}}</div>
      </div>
    </div>
    <div class="doc-box">
      <div class="doc-title">PRESUPUESTO</div>
      <div class="doc-number">NRO.: {{presupuesto.numero}}</div>
      <div class="doc-meta">
        <div><strong>Fecha:</strong> {{presupuesto.fecha}}</div>
      </div>
    </div>
  </div>

  <div style="border:1px solid #1e293b;border-top:none;padding:8px 10px;margin-bottom:12px;font-size:11px">
    <div><strong>SEÑOR(ES):</strong> {{cliente.nombre}}</div>
    <div><strong>DIRECCIÓN:</strong> {{cliente.direccion}}</div>
    <div><strong>RUC/CI:</strong> {{cliente.documento}}</div>
  </div>

  {{presupuesto.items}}

  <div style="margin-top:14px;display:flex;justify-content:flex-end;font-size:11px">
    <div style="text-align:right">
      <div class="label">Total (en letras)</div>
      <div>GUARANIES: {{presupuesto.totalEnLetras}}.-</div>
      <div style="font-size:16px;font-weight:700;margin-top:4px">Gs. {{presupuesto.total}}</div>
    </div>
  </div>

  <div style="margin-top:24px;font-size:10.5px;color:#64748b">
    Presupuesto sujeto a disponibilidad de stock al momento de la confirmación. No compromete stock hasta convertirse en pedido.
  </div>
</body>
</html>`;

export const DEFAULT_PURCHASE_ORDER_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  ${SHARED_STYLES}
  @page { size: A4; margin: 0; }
  .parties { display: flex; gap: 12px; margin-bottom: 12px; }
  .party { flex: 1; border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 11px; line-height: 1.5; }
  .party .label { margin-bottom: 3px; }
  .party-name { font-size: 12.5px; font-weight: 700; }
  .data-table td:nth-child(3), .data-table td:nth-child(4) { text-align: center; }
  .data-table td:nth-child(5), .data-table td:nth-child(6),
  .data-table th:nth-child(5), .data-table th:nth-child(6) { text-align: right; }
  .data-table td:nth-child(1), .data-table td:nth-child(5), .data-table td:nth-child(6) { white-space: nowrap; }
  .notes { margin-top: 14px; border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 11px; white-space: pre-line; }
  .signature { margin-top: 56px; width: 240px; border-top: 1px solid #1e293b; padding-top: 4px; font-size: 10.5px; text-align: center; }
</style>
</head>
<body>
  <div class="company-header">
    <div class="company-block">
      {{tenant.logo}}
      <div>
        <div class="company-name">{{tenant.razonSocial}}</div>
        <div class="company-meta">{{tenant.direccion}} — {{tenant.ciudad}}</div>
        <div class="company-meta">Tel: {{tenant.telefono}} · {{tenant.email}}</div>
        <div class="company-meta">RUC: {{tenant.ruc}}</div>
      </div>
    </div>
    <div class="doc-box">
      <div class="doc-title">ORDEN DE COMPRA</div>
      <div class="doc-number">NRO.: {{orden.numero}}</div>
      <div class="doc-meta">
        <div><strong>Fecha:</strong> {{orden.fecha}}</div>
        <div><strong>Entrega estimada:</strong> {{orden.entregaEstimada}}</div>
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="label">Proveedor</div>
      <div class="party-name">{{proveedor.nombre}}</div>
      <div><strong>RUC:</strong> {{proveedor.ruc}}</div>
      <div><strong>Dirección:</strong> {{proveedor.direccion}}</div>
      <div><strong>Contacto:</strong> {{proveedor.contacto}} · {{proveedor.telefono}}</div>
      <div><strong>Email:</strong> {{proveedor.email}}</div>
    </div>
    <div class="party">
      <div class="label">Condiciones</div>
      <div><strong>Condición de pago:</strong> {{orden.condicionPago}}</div>
      <div><strong>Lugar de entrega:</strong> {{orden.lugarEntrega}}</div>
    </div>
  </div>

  {{orden.items}}

  <div style="margin-top:14px;display:flex;justify-content:flex-end;font-size:11px">
    <div style="text-align:right">
      <div class="label">Total (en letras)</div>
      <div>GUARANIES: {{orden.totalEnLetras}}.-</div>
      <div style="font-size:16px;font-weight:700;margin-top:4px">Gs. {{orden.total}}</div>
    </div>
  </div>

  <div class="notes"><span class="label">Observaciones</span>
{{orden.notas}}</div>

  <div class="signature">Autorizado por {{tenant.razonSocial}}</div>
</body>
</html>`;
