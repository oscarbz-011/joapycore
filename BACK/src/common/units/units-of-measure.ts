import { Industry } from '@prisma/client';

/**
 * Tabla de unidades de medida de SIFEN (cUniMed, ampliada por la NT 23). El
 * símbolo es el que va en dDesUniMed y en los documentos impresos.
 * `decimals` es cuántos decimales se pueden cargar: 0 para lo que se cuenta
 * (unidades, cajas, pares) y 3 para lo que se mide (kg, m, m², litros).
 */
export interface UnitOfMeasure {
  code: number;
  symbol: string;
  name: string;
  decimals: 0 | 3;
}

const unit = (
  code: number,
  symbol: string,
  name: string,
  decimals: 0 | 3,
): UnitOfMeasure => ({ code, symbol, name, decimals });

export const UNITS_OF_MEASURE: readonly UnitOfMeasure[] = [
  unit(77, 'UNI', 'Unidad', 0),
  unit(79, 'kg/m2', 'Kilogramos s/ metro cuadrado', 3),
  unit(83, 'kg', 'Kilogramos', 3),
  unit(86, 'g', 'Gramos', 3),
  unit(87, 'm', 'Metros', 3),
  unit(88, 'ML', 'Mililitros', 3),
  unit(89, 'LT', 'Litros', 3),
  unit(90, 'MG', 'Miligramos', 3),
  unit(91, 'CM', 'Centímetros', 3),
  unit(92, 'CM2', 'Centímetros cuadrados', 3),
  unit(93, 'CM3', 'Centímetros cúbicos', 3),
  unit(94, 'PUL', 'Pulgadas', 3),
  unit(95, 'MM', 'Milímetros', 3),
  unit(96, 'MM2', 'Milímetros cuadrados', 3),
  unit(97, 'AA', 'Año', 3),
  unit(98, 'ME', 'Mes', 3),
  unit(99, 'TN', 'Tonelada', 3),
  unit(100, 'Hs', 'Hora', 3),
  unit(101, 'Mi', 'Minuto', 3),
  unit(102, 'Di', 'Día', 3),
  unit(103, 'Ya', 'Yardas', 3),
  unit(104, 'DET', 'Determinación', 0),
  unit(108, 'MT', 'Metros', 3),
  unit(109, 'M2', 'Metros cuadrados', 3),
  unit(110, 'M3', 'Metros cúbicos', 3),
  unit(111, '4A', 'Bobinas', 0),
  unit(112, 'Ci', 'Curie', 3),
  unit(113, 'DOC', 'Docena', 0),
  unit(114, 'GLL', 'Galones (US) (3,7843 LT)', 3),
  unit(115, 'GRO', 'Gruesas', 0),
  unit(116, 'E4', 'Kilogramo bruto', 3),
  unit(117, 'KT', 'Kits', 0),
  unit(118, 'M5', 'Microcurie', 3),
  unit(119, 'MCU', 'Milicurie', 3),
  unit(120, 'MIL', 'Millar', 0),
  unit(121, 'PAR', 'Par', 0),
  unit(122, 'FOT', 'Pies', 3),
  unit(123, 'FTK', 'Pies cuadrados', 3),
  unit(124, 'PCE', 'Piezas', 0),
  unit(125, 'KLT', 'Quilate', 3),
  unit(126, 'RM', 'Resmas', 0),
  unit(127, 'RO', 'Rollos', 0),
  unit(128, 'kWh', '1000 Kilowatt hora', 3),
  unit(129, 'U(JGO)', 'Mazos', 0),
  unit(130, 'DR', 'Tambores', 0),
  unit(131, 'BX', 'Caja', 0),
  unit(132, 'SET', 'Juego', 0),
  unit(133, 'PK', 'Paquete', 0),
  unit(134, 'BG', 'Bolsa', 0),
  unit(135, 'DPC', 'Docena par', 0),
  unit(136, 'JR', 'Pote', 0),
  unit(137, 'BL', 'Fardos', 0),
  unit(138, 'AB', 'Bulto', 0),
  unit(139, 'BK', 'Cesta', 0),
  unit(140, 'BW', 'Peso base', 3),
  unit(569, 'ración', 'Ración', 0),
  unit(625, 'Km', 'Kilómetros', 3),
  unit(660, 'ml', 'Metro lineal', 3),
  unit(666, 'Se', 'Segundo', 3),
  unit(869, 'ha', 'Hectáreas', 3),
  unit(885, 'GL', 'Unidad medida global', 0),
  unit(891, 'pm', 'Por milaje', 3),
  unit(2329, 'UI', 'Unidad internacional', 0),
  unit(2366, 'CPM', 'Costo por mil', 0),
];

export const DEFAULT_UNIT_CODE = 77;

export const UNIT_CODES = UNITS_OF_MEASURE.map((u) => u.code);

const BY_CODE = new Map(UNITS_OF_MEASURE.map((u) => [u.code, u]));

export function unitOfMeasure(code: number): UnitOfMeasure {
  const found = BY_CODE.get(code);
  if (!found) throw new Error(`Unidad de medida desconocida: ${code}`);
  return found;
}

export function unitSymbol(code: number): string {
  return unitOfMeasure(code).symbol;
}

/** Las que cada rubro usa más: el selector las muestra primero. */
export const INDUSTRY_UNIT_CODES: Record<Industry, readonly number[]> = {
  ELECTRODOMESTICOS: [77, 132, 117],
  FERRETERIA: [77, 87, 660, 109, 83, 89, 131, 133, 127, 121],
  SUPERMERCADO: [77, 83, 86, 89, 88, 131, 133, 113, 134],
  MUEBLERIA: [77, 109, 87, 660, 110, 124, 132],
  SERVICIOS: [77, 100, 102, 98, 885],
  OTRO: [77],
};
