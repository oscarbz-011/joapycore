# Separación de catálogo, stock y canales de venta

**Fecha:** 2026-09-30
**Estado:** Aprobado en conversación; pendiente de revisión del documento

## Contexto

El frontend actual concentra catálogo y stock en `/dashboard/inventory`, mantiene una navegación secundaria por pestañas y agrupa Categorías y Marcas en una misma página. El sidebar, en cambio, presenta esas capacidades como destinos independientes e incluye opciones que todavía son marcadores sin ruta propia.

El modelo actual también usa `Product.isSellable` como indicador global. Por ello Ventas y POS consumen el mismo catálogo, aunque el modelo de pedidos ya distingue los canales `NORMAL`, `POS` y `ECOMMERCE`. El stock total se calcula correctamente, pero el desglose por depósito es incompleto: los movimientos admiten `warehouseId` nulo y las unidades serializadas no almacenan depósito.

## Objetivos

1. Usar el sidebar como única navegación de primer nivel del módulo de Inventario.
2. Separar el catálogo de productos del stock físico.
3. Mostrar stock total y por depósito mediante una consulta autoritativa del backend.
4. Mantener visibles los productos vendibles con existencia cero.
5. Permitir que un producto participe en uno o más canales de venta.
6. Hacer trazable la ubicación de unidades serializadas y no serializadas.
7. Mantener las mutaciones de existencias en la pantalla Movimientos.

## Fuera de alcance

- Implementar una tienda o sincronización e-commerce.
- Crear conteos cíclicos, tomas de inventario o conciliaciones.
- Cambiar los cuatro estados actuales del producto.
- Introducir un permiso nuevo para leer stock.
- Atribuir automáticamente registros históricos sin depósito a una ubicación.

## Modelo de dominio

### Catálogo de productos

Un Producto es una ficha maestra independiente de su existencia física. La pantalla Productos administra todos los productos, incluidos borradores, bloqueados y descontinuados. Conserva los estados actuales:

- `DRAFT`: ficha incompleta.
- `ACTIVE`: ficha completa y operativa.
- `INACTIVE`: producto descontinuado.
- `BLOCKED`: producto restringido.

El estado no equivale a disponibilidad ni a stock.

### Canales de venta

`Product.isSellable` se reemplazará por `Product.salesChannels`, una colección del enum existente `OrderChannel`:

- `NORMAL`
- `POS`
- `ECOMMERCE`

Un producto puede tener cero, uno o varios canales. Tener canales configurados no evita la validación del estado: solo los productos `ACTIVE` pueden participar en una venta nueva.

La migración de datos asignará `[NORMAL, POS]` a cada producto cuyo `isSellable` actual sea verdadero y `[]` a los demás. `ECOMMERCE` quedará deshabilitado hasta configurarlo expresamente.

Los valores predeterminados al crear serán:

| Tipo de producto | Canales iniciales |
| --- | --- |
| `RESALE` | `NORMAL`, `POS` |
| `MANUFACTURED` | `NORMAL`, `POS` |
| `RAW_MATERIAL` | ninguno |

La configuración seguirá siendo editable por producto para contemplar casos mixtos.

### Stock físico

Stock físico es la existencia actual, no un atributo editable de la ficha. Para productos no serializados se calcula sumando movimientos; para productos serializados se cuentan unidades `IN_STOCK`.

La pantalla Stock incluirá exclusivamente productos que cumplan ambas condiciones:

1. `status = ACTIVE`.
2. `salesChannels` contiene al menos un canal.

La cantidad puede ser positiva, cero o negativa para no ocultar inconsistencias existentes.

El total general es la suma de todas las ubicaciones, incluida la cantidad sin depósito asignado. Esta última siempre se presenta separada y nunca se incorpora silenciosamente a un depósito.

## Navegación

El sidebar será la única navegación de primer nivel:

| Opción | Ruta |
| --- | --- |
| Productos | `/dashboard/inventory/products` |
| Categorías | `/dashboard/inventory/categories` |
| Marcas | `/dashboard/inventory/brands` |
| Movimientos | `/dashboard/inventory/movements` |
| Lotes | `/dashboard/inventory/batches` |
| Carga inicial | `/dashboard/inventory/stock-entries/initial` |
| Stock | `/dashboard/inventory/stock` |

Se elimina la opción “Inventario”. `/dashboard/inventory` redirigirá a Productos y la ruta anterior `/dashboard/inventory/config` redirigirá a Categorías para conservar enlaces existentes.

La detección de la opción activa considerará subrutas. Por ejemplo, `/dashboard/inventory/products/:id` mantendrá activo Productos.

Se eliminan las pestañas generales de Productos, Movimientos y Configuración. Las secciones internas del detalle de un producto pueden permanecer porque organizan información de una sola entidad y no reemplazan al sidebar.

## Pantallas

### Productos

Productos será el catálogo maestro. Permitirá crear fichas, editar todos sus detalles y cambiar estado o canales.

La lista estará orientada al catálogo y dejará de mostrar cantidades, stock crítico y valor del inventario. Mostrará, según el espacio disponible:

- nombre y modelo;
- categoría y marca;
- tipo;
- estado;
- canales habilitados;
- capacidad de compra;
- precios.

Los indicadores superiores resumirán catálogo: total, activos, borradores, descontinuados y bloqueados. El formulario de producto ofrecerá selección múltiple de `NORMAL`, `POS` y `ECOMMERCE`.

### Stock

Stock será de consulta y no ofrecerá acciones de entrada, salida o ajuste.

Controles:

- búsqueda por nombre o modelo;
- filtro por categoría;
- filtro por marca;
- selector de depósito siempre visible;
- “Todos los depósitos” como selección inicial.

Presentación:

- con “Todos los depósitos”, muestra Total general, una columna por depósito y “Sin depósito asignado” cuando exista cantidad no localizada;
- con un depósito concreto, muestra Total general y la cantidad del depósito seleccionado;
- todos los productos elegibles permanecen visibles aunque tengan cero en el depósito seleccionado;
- los depósitos inactivos que todavía posean existencia permanecen visibles con una marca de inactividad, pero no aceptan movimientos nuevos;
- cada fila permite abrir el detalle del producto.

Los indicadores superiores se basarán solo en el conjunto elegible de Stock, no en todo el catálogo.

### Movimientos

Movimientos seguirá siendo el único punto de interfaz para entradas, salidas, transferencias y ajustes. Los controles usarán selectores de depósitos reales en lugar de pedir IDs manuales.

Para productos no serializados se solicita cantidad. Para productos serializados se seleccionan o ingresan números de serie según la operación. Las mutaciones de una unidad y su registro histórico ocurren en una misma transacción.

### Categorías y Marcas

Las operaciones existentes se separan en páginas completas. Cada página mantiene alta, listado, activación y desactivación con los permisos actuales.

## Persistencia y migración

### Producto

Agregar `salesChannels OrderChannel[]` y migrar desde `isSellable` según la regla aprobada. Después de actualizar consumidores y validaciones se elimina `isSellable`, evitando dos fuentes de verdad.

### Unidad serializada

Agregar `ProductUnit.warehouseId` nullable y su relación con `Warehouse`. Es nullable solo para representar datos históricos sin ubicación.

Toda unidad serializada nueva debe recibir depósito. Una venta conserva en la unidad la última ubicación conocida aunque cambie su estado a `SOLD`; una devolución debe devolverla al depósito indicado por la operación.

### Datos históricos

No se infiere ubicación para movimientos o unidades existentes con `warehouseId = null`. Esos registros alimentan “Sin depósito asignado”. La regularización se hará mediante un movimiento explícito, dejando trazabilidad.

## Interfaces del backend

### Consulta dedicada de stock

Crear una interfaz de lectura bajo `GET /inventory/stock` con filtros opcionales:

- `search`
- `categoryId`
- `brandId`
- `warehouseId`

La respuesta incluirá metadatos de depósitos y filas con una forma equivalente a:

```ts
interface StockRow {
  product: {
    id: string;
    name: string;
    model: string | null;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
    salesChannels: OrderChannel[];
  };
  totalStock: number;
  stockByWarehouse: Array<{
    warehouseId: string;
    warehouseName: string;
    isActive: boolean;
    quantity: number;
  }>;
  unassignedStock: number;
}
```

Si llega `warehouseId`, `totalStock` continúa representando toda la empresa y `stockByWarehouse` se reduce a la ubicación solicitada. El filtro no elimina productos con cantidad cero en esa ubicación.

La implementación del módulo de consulta oculta si el producto es serializado. Para productos no serializados agrupa `StockMovement`; para serializados agrupa `ProductUnit` con estado `IN_STOCK`.

### Filtros de catálogo

Los filtros `isSellable` se reemplazan por `salesChannel`. Ventas normales consultará `NORMAL`; POS consultará `POS`. La futura integración consultará `ECOMMERCE` sin requerir otro cambio de modelo.

### Validación de ventas

La validación recibirá el canal efectivo del pedido y exigirá:

1. producto `ACTIVE`;
2. canal incluido en `product.salesChannels`.

La ruta normal usa `NORMAL`, la venta rápida usa `POS` y el canal ya definido para futuras órdenes será `ECOMMERCE`. La validación se mantiene en backend aunque el frontend filtre el selector.

## Reglas de movimientos

- Toda nueva operación que cambie stock debe indicar un depósito activo.
- Una transferencia exige origen y destino activos y distintos.
- Una salida o transferencia no puede superar la existencia del depósito de origen.
- Una unidad serializada debe estar `IN_STOCK` y pertenecer al depósito de origen.
- El ingreso serializado exige tantos números de serie únicos como cantidad declarada.
- La actualización de existencia y la escritura del historial se ejecutan en una transacción.
- La regularización de “Sin depósito asignado” es explícita y auditable.

El historial puede usar dos movimientos enlazados por la misma referencia para una transferencia. El cálculo de stock serializado sigue usando `ProductUnit` como fuente de verdad; sus movimientos sirven como historial y no se suman nuevamente.

## Permisos

No se agregan permisos:

- Productos y Stock: `inventory:products:read`.
- Editar fichas, estados o canales: `inventory:products:update`.
- Categorías y Marcas: permisos actuales de cada recurso.
- Registrar movimientos: `inventory:movements:create`.

## Errores y estados vacíos

- Depósito inexistente o inactivo: rechazar la operación con error de validación.
- Canal no habilitado: rechazar la venta identificando producto y canal.
- Existencia insuficiente en origen: rechazar sin modificar ninguna fila.
- Unidad serializada en otro depósito o no disponible: rechazar la operación completa.
- Sin depósitos configurados: Stock muestra totales y “Sin depósito asignado”; Movimientos explica que debe configurarse un depósito antes de operar.
- Sin productos elegibles: Stock explica que solo aparecen productos activos con al menos un canal.

## Estrategia de pruebas

### Backend

- Migración de `isSellable = true` a `[NORMAL, POS]` y falso a `[]`.
- Valores predeterminados por `ProductKind`.
- Filtro independiente de `NORMAL`, `POS` y `ECOMMERCE`.
- Rechazo de ventas por estado o canal.
- Cálculo de total, depósito y cantidad sin asignar para productos no serializados.
- El mismo cálculo para productos serializados.
- Inclusión de stock cero y exclusión por estado o ausencia de canales.
- Reglas de entrada, salida y transferencia, incluidas atomicidad e insuficiencia.
- Ubicación y transferencia de números de serie.

### Frontend

- Rutas y enlaces del sidebar, incluida activación por subruta.
- Ausencia de navegación general por pestañas.
- Redirecciones de compatibilidad.
- Separación de Categorías y Marcas.
- Productos muestra todos los estados y edita múltiples canales.
- Stock muestra total general y columnas correctas según el filtro de depósito.
- Stock conserva filas con cantidad cero.
- Movimientos usa selectores de depósito y no inputs de ID.

### Verificación final

- Pruebas completas de backend y frontend con pnpm.
- Lint y comprobación de tipos en ambos proyectos.
- Builds de producción.
- Revisión manual de las rutas principales y de un producto serializado y otro no serializado.

## Orden de despliegue

El cambio se entrega de forma coordinada porque elimina `isSellable` del contrato:

1. migración de esquema y datos;
2. backend con canales, ubicación serializada y consulta de stock;
3. frontend con rutas, pantallas y consumidores actualizados;
4. verificación de datos sin depósito y canales migrados.

No se debe desplegar un frontend que envíe `salesChannels` contra un backend antiguo ni retirar `isSellable` antes de actualizar todos sus consumidores.
