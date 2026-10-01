# JoapyCore

JoapyCore gestiona el catálogo comercial y las existencias físicas de una empresa sin confundir la definición de un producto con la cantidad disponible para operar.

## Inventario

**Producto**:
Ficha maestra de un artículo, con su identidad comercial, clasificación, precios, estado y canales de venta. Puede existir aunque todavía no tenga existencia física.
_Avoid_: Stock, existencia

**Estado del producto**:
Condición operativa de la ficha: borrador, activo, descontinuado o bloqueado. No describe cuántas unidades existen.
_Avoid_: Estado de stock, disponibilidad

**Canal de venta**:
Flujo comercial en el que un producto activo está habilitado para venderse: `NORMAL`, `POS` o `ECOMMERCE`. Un producto puede pertenecer a ninguno, uno o varios canales.
_Avoid_: Vendible, tipo de venta

**Stock físico**:
Cantidad existente de un producto, calculada desde sus movimientos o unidades serializadas y localizada por depósito. Incluye el total general y, cuando corresponda, la cantidad todavía sin depósito asignado.
_Avoid_: Producto, catálogo, inventario contable

**Depósito**:
Ubicación física a la que se atribuye una existencia. Las operaciones nuevas de stock siempre deben identificar el depósito afectado.
_Avoid_: Sucursal, ubicación genérica

**Sin depósito asignado**:
Existencia histórica cuya ubicación física no puede determinarse con los datos actuales. Se muestra por separado y nunca se atribuye automáticamente al depósito principal.
_Avoid_: Depósito principal, stock general
