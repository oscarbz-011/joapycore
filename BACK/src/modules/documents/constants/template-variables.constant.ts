import { TemplateKind } from '@prisma/client';
import type { TemplateVariableDef } from '../../../common/types/template-variable.interface';

export type { TemplateVariableDef } from '../../../common/types/template-variable.interface';

export interface TemplateKindDef {
  key: TemplateKind;
  label: string;
  variables: TemplateVariableDef[];
}

// Vocabulario fijo de variables por tipo de plantilla — es un contrato de
// integración (como los nombres de eventos), no datos hardcodeados: define
// qué puede insertar el usuario en el editor de plantillas, y el backend
// resuelve los valores reales al momento de generar el documento.
export const TEMPLATE_KIND_DEFS: Record<TemplateKind, TemplateKindDef> = {
  [TemplateKind.SALE_CONTRACT]: {
    key: TemplateKind.SALE_CONTRACT,
    label: 'Contrato de compra-venta',
    variables: [
      {
        key: 'tenant.razonSocial',
        label: 'Razón social de la empresa',
        type: 'text',
      },
      { key: 'tenant.ruc', label: 'RUC de la empresa', type: 'text' },
      {
        key: 'tenant.direccion',
        label: 'Dirección de la empresa',
        type: 'text',
      },
      {
        key: 'cliente.nombre',
        label: 'Nombre completo del cliente',
        type: 'text',
      },
      {
        key: 'cliente.documento',
        label: 'Documento de identidad del cliente',
        type: 'text',
      },
      { key: 'cliente.email', label: 'Email del cliente', type: 'text' },
      { key: 'cliente.telefono', label: 'Teléfono del cliente', type: 'text' },
      {
        key: 'cliente.direccion',
        label: 'Dirección del cliente',
        type: 'text',
      },
      { key: 'sucursal.ciudad', label: 'Ciudad de la sucursal', type: 'text' },
      {
        key: 'venta.fecha',
        label: 'Fecha de la venta (dd/mm/aaaa)',
        type: 'text',
      },
      {
        key: 'venta.fechaLarga',
        label:
          'Fecha de la venta, en letras ("25 días del mes de julio del año 2026")',
        type: 'text',
      },
      {
        key: 'venta.items',
        label: 'Detalle de productos vendidos (tabla)',
        type: 'table',
        columns: ['Producto', 'Cantidad', 'Precio unitario', 'Subtotal'],
      },
      { key: 'venta.total', label: 'Total de la venta', type: 'text' },
      {
        key: 'venta.totalEnLetras',
        label: 'Total de la venta, en letras',
        type: 'text',
      },
      {
        key: 'factura.numero',
        label: 'Número de factura emitida',
        type: 'text',
      },
      {
        key: 'factura.fecha',
        label: 'Fecha de emisión de la factura',
        type: 'text',
      },
      {
        key: 'credito.entrega',
        label: 'Monto de entrega inicial (pie)',
        type: 'text',
      },
      {
        key: 'credito.entregaEnLetras',
        label: 'Monto de entrega inicial (pie), en letras',
        type: 'text',
      },
      {
        key: 'credito.montoFinanciado',
        label: 'Monto financiado',
        type: 'text',
      },
      { key: 'credito.tasaInteres', label: 'Tasa de interés', type: 'text' },
      {
        key: 'credito.cantidadCuotas',
        label: 'Cantidad de cuotas',
        type: 'text',
      },
      {
        key: 'credito.cuotaMensual',
        label: 'Monto de cada cuota',
        type: 'text',
      },
      {
        key: 'credito.montoTotal',
        label: 'Monto total a pagar (con intereses)',
        type: 'text',
      },
      {
        key: 'credito.cuotas',
        label: 'Plan de cuotas completo, una fila por cuota (tabla)',
        type: 'table',
        columns: ['Nro. cuota', 'Fecha vencimiento', 'Importe cuota'],
      },
      {
        key: 'credito.cuotas2col',
        label:
          'Plan de cuotas completo, en dos bloques de columnas lado a lado (tabla)',
        type: 'table',
        columns: [
          'Nro.cuota',
          'Fecha vencimiento',
          'Importe cuota',
          'Nro.cuota',
          'Fecha vencimiento',
          'Importe cuota',
        ],
      },
      {
        key: 'garante.nombre',
        label:
          'Nombre completo del garante (vacío si el pedido no tiene garante)',
        type: 'text',
      },
      {
        key: 'garante.documento',
        label: 'Tipo y número de documento del garante',
        type: 'text',
      },
      {
        key: 'garante.direccion',
        label: 'Dirección del garante',
        type: 'text',
      },
      { key: 'garante.telefono', label: 'Teléfono del garante', type: 'text' },
      { key: 'garante.email', label: 'Email del garante', type: 'text' },
    ],
  },
  [TemplateKind.INVOICE]: {
    key: TemplateKind.INVOICE,
    label: 'Factura',
    variables: [
      {
        key: 'tenant.razonSocial',
        label: 'Razón social de la empresa',
        type: 'text',
      },
      { key: 'tenant.ruc', label: 'RUC de la empresa', type: 'text' },
      {
        key: 'tenant.direccion',
        label: 'Dirección de la empresa',
        type: 'text',
      },
      { key: 'tenant.ciudad', label: 'Ciudad de la empresa', type: 'text' },
      { key: 'tenant.telefono', label: 'Teléfono de la empresa', type: 'text' },
      { key: 'timbrado.numero', label: 'Número de timbrado', type: 'text' },
      {
        key: 'timbrado.inicioVigencia',
        label: 'Inicio de vigencia del timbrado',
        type: 'text',
      },
      {
        key: 'timbrado.finVigencia',
        label: 'Fin de vigencia del timbrado',
        type: 'text',
      },
      { key: 'factura.numero', label: 'Número de factura', type: 'text' },
      { key: 'factura.fechaEmision', label: 'Fecha de emisión', type: 'text' },
      {
        key: 'cliente.nombre',
        label: 'Nombre completo del cliente',
        type: 'text',
      },
      {
        key: 'cliente.documento',
        label: 'Documento de identidad del cliente',
        type: 'text',
      },
      {
        key: 'cliente.direccion',
        label: 'Dirección del cliente',
        type: 'text',
      },
      { key: 'cliente.codigo', label: 'Código de cliente', type: 'text' },
      {
        key: 'factura.condicionVenta',
        label: 'Condición de venta (contado o crédito con detalle de cuotas)',
        type: 'text',
      },
      {
        key: 'factura.items',
        label: 'Detalle de ítems con IVA discriminado (tabla)',
        type: 'table',
        columns: [
          'Descripción',
          'Cant.',
          'P. Unit. IVA inc.',
          'Exentas',
          '5%',
          '10%',
        ],
      },
      {
        key: 'factura.subtotalExentas',
        label: 'Subtotal de ítems exentos',
        type: 'text',
      },
      {
        key: 'factura.subtotal5',
        label: 'Subtotal de ítems con IVA 5%',
        type: 'text',
      },
      {
        key: 'factura.subtotal10',
        label: 'Subtotal de ítems con IVA 10%',
        type: 'text',
      },
      { key: 'factura.iva5', label: 'Total IVA 5%', type: 'text' },
      { key: 'factura.iva10', label: 'Total IVA 10%', type: 'text' },
      { key: 'factura.totalIva', label: 'Total IVA (5% + 10%)', type: 'text' },
      { key: 'factura.total', label: 'Total a pagar', type: 'text' },
      {
        key: 'factura.totalEnLetras',
        label: 'Total a pagar, en letras',
        type: 'text',
      },
    ],
  },
  [TemplateKind.PAYMENT_RECEIPT]: {
    key: TemplateKind.PAYMENT_RECEIPT,
    label: 'Recibo de dinero',
    variables: [
      {
        key: 'tenant.razonSocial',
        label: 'Razón social de la empresa',
        type: 'text',
      },
      { key: 'tenant.ruc', label: 'RUC de la empresa', type: 'text' },
      {
        key: 'tenant.direccion',
        label: 'Dirección de la empresa',
        type: 'text',
      },
      { key: 'tenant.telefono', label: 'Teléfono de la empresa', type: 'text' },
      { key: 'recibo.numero', label: 'Número de recibo', type: 'text' },
      { key: 'recibo.ciudad', label: 'Ciudad de emisión', type: 'text' },
      { key: 'recibo.fecha', label: 'Fecha de emisión', type: 'text' },
      {
        key: 'cliente.nombre',
        label: 'Nombre completo del cliente',
        type: 'text',
      },
      {
        key: 'cliente.documento',
        label: 'Documento de identidad del cliente',
        type: 'text',
      },
      { key: 'cliente.codigo', label: 'Código de cliente', type: 'text' },
      {
        key: 'recibo.montoEnLetras',
        label: 'Monto recibido, en letras',
        type: 'text',
      },
      { key: 'recibo.total', label: 'Monto recibido', type: 'text' },
      {
        key: 'recibo.items',
        label: 'Detalle de cuotas cubiertas (tabla)',
        type: 'table',
        columns: ['Item', 'Concepto', 'Guaraníes'],
      },
      {
        key: 'recibo.formaDePago',
        label: 'Forma de pago (Efectivo / Tarjeta / Cheque)',
        type: 'text',
      },
      { key: 'recibo.cobrador', label: 'Nombre de quien cobró', type: 'text' },
    ],
  },
  [TemplateKind.QUOTE]: {
    key: TemplateKind.QUOTE,
    label: 'Presupuesto',
    variables: [
      {
        key: 'tenant.razonSocial',
        label: 'Razón social de la empresa',
        type: 'text',
      },
      {
        key: 'tenant.direccion',
        label: 'Dirección de la empresa',
        type: 'text',
      },
      { key: 'tenant.ciudad', label: 'Ciudad de la empresa', type: 'text' },
      { key: 'tenant.telefono', label: 'Teléfono de la empresa', type: 'text' },
      {
        key: 'presupuesto.numero',
        label: 'Número de presupuesto',
        type: 'text',
      },
      { key: 'presupuesto.fecha', label: 'Fecha de emisión', type: 'text' },
      {
        key: 'cliente.nombre',
        label: 'Nombre completo del cliente',
        type: 'text',
      },
      {
        key: 'cliente.documento',
        label: 'Documento de identidad del cliente',
        type: 'text',
      },
      {
        key: 'cliente.direccion',
        label: 'Dirección del cliente',
        type: 'text',
      },
      {
        key: 'presupuesto.items',
        label: 'Detalle de ítems, con especificaciones si las tiene (tabla)',
        type: 'table',
        columns: ['Descripción', 'Cant.', 'P. Unitario', 'Subtotal'],
      },
      {
        key: 'presupuesto.total',
        label: 'Total del presupuesto',
        type: 'text',
      },
      {
        key: 'presupuesto.totalEnLetras',
        label: 'Total del presupuesto, en letras',
        type: 'text',
      },
    ],
  },
  [TemplateKind.INTEREST_INVOICE]: {
    key: TemplateKind.INTEREST_INVOICE,
    label: 'Factura de intereses moratorios',
    variables: [
      {
        key: 'tenant.razonSocial',
        label: 'Razón social de la empresa',
        type: 'text',
      },
      { key: 'tenant.ruc', label: 'RUC de la empresa', type: 'text' },
      {
        key: 'tenant.direccion',
        label: 'Dirección de la empresa',
        type: 'text',
      },
      { key: 'tenant.ciudad', label: 'Ciudad de la empresa', type: 'text' },
      { key: 'tenant.telefono', label: 'Teléfono de la empresa', type: 'text' },
      { key: 'timbrado.numero', label: 'Número de timbrado', type: 'text' },
      {
        key: 'timbrado.inicioVigencia',
        label: 'Inicio de vigencia del timbrado',
        type: 'text',
      },
      {
        key: 'timbrado.finVigencia',
        label: 'Fin de vigencia del timbrado',
        type: 'text',
      },
      { key: 'factura.numero', label: 'Número de factura', type: 'text' },
      { key: 'factura.fechaEmision', label: 'Fecha de emisión', type: 'text' },
      {
        key: 'cliente.nombre',
        label: 'Nombre completo del cliente',
        type: 'text',
      },
      {
        key: 'cliente.documento',
        label: 'Documento de identidad del cliente',
        type: 'text',
      },
      { key: 'cliente.codigo', label: 'Código de cliente', type: 'text' },
      {
        key: 'factura.reciboOrigen',
        label: 'Número del recibo de cobro que originó esta factura',
        type: 'text',
      },
      {
        key: 'factura.items',
        label: 'Detalle de intereses por cuota, con IVA discriminado (tabla)',
        type: 'table',
        columns: [
          'Descripción',
          'Cant.',
          'P. Unit. IVA inc.',
          'Exentas',
          '5%',
          '10%',
        ],
      },
      {
        key: 'factura.subtotalExentas',
        label: 'Subtotal de ítems exentos',
        type: 'text',
      },
      {
        key: 'factura.subtotal5',
        label: 'Subtotal de ítems con IVA 5%',
        type: 'text',
      },
      {
        key: 'factura.subtotal10',
        label: 'Subtotal de ítems con IVA 10%',
        type: 'text',
      },
      { key: 'factura.iva5', label: 'Total IVA 5%', type: 'text' },
      { key: 'factura.iva10', label: 'Total IVA 10%', type: 'text' },
      { key: 'factura.totalIva', label: 'Total IVA (5% + 10%)', type: 'text' },
      { key: 'factura.total', label: 'Total a pagar', type: 'text' },
      {
        key: 'factura.totalEnLetras',
        label: 'Total a pagar, en letras',
        type: 'text',
      },
    ],
  },
  [TemplateKind.PURCHASE_ORDER]: {
    key: TemplateKind.PURCHASE_ORDER,
    label: 'Orden de compra',
    variables: [
      {
        key: 'tenant.razonSocial',
        label: 'Razón social de la empresa',
        type: 'text',
      },
      { key: 'tenant.ruc', label: 'RUC de la empresa', type: 'text' },
      {
        key: 'tenant.direccion',
        label: 'Dirección de la empresa',
        type: 'text',
      },
      { key: 'tenant.ciudad', label: 'Ciudad de la empresa', type: 'text' },
      { key: 'tenant.telefono', label: 'Teléfono de la empresa', type: 'text' },
      { key: 'tenant.email', label: 'Email de la empresa', type: 'text' },
      {
        key: 'proveedor.nombre',
        label: 'Nombre o razón social del proveedor',
        type: 'text',
      },
      { key: 'proveedor.ruc', label: 'RUC del proveedor', type: 'text' },
      {
        key: 'proveedor.direccion',
        label: 'Dirección del proveedor',
        type: 'text',
      },
      {
        key: 'proveedor.contacto',
        label: 'Persona de contacto del proveedor',
        type: 'text',
      },
      {
        key: 'proveedor.telefono',
        label: 'Teléfono del proveedor',
        type: 'text',
      },
      { key: 'proveedor.email', label: 'Email del proveedor', type: 'text' },
      {
        key: 'orden.numero',
        label: 'Número de la orden de compra',
        type: 'text',
      },
      { key: 'orden.fecha', label: 'Fecha de la orden', type: 'text' },
      {
        key: 'orden.entregaEstimada',
        label: 'Fecha estimada de entrega',
        type: 'text',
      },
      {
        key: 'orden.lugarEntrega',
        label: 'Lugar de entrega (sucursal o empresa)',
        type: 'text',
      },
      {
        key: 'orden.condicionPago',
        label: 'Condición de pago acordada con el proveedor',
        type: 'text',
      },
      { key: 'orden.notas', label: 'Observaciones de la orden', type: 'text' },
      { key: 'orden.total', label: 'Total de la orden', type: 'text' },
      {
        key: 'orden.totalEnLetras',
        label: 'Total de la orden, en letras',
        type: 'text',
      },
      {
        key: 'orden.items',
        label: 'Detalle de ítems, con el código del proveedor (tabla)',
        type: 'table',
        columns: [
          'Código',
          'Descripción',
          'Cant.',
          'Unidad',
          'Costo unit.',
          'Subtotal',
        ],
      },
    ],
  },
};

export function getTemplateKindDefs(): TemplateKindDef[] {
  return Object.values(TEMPLATE_KIND_DEFS);
}
