import { Industry, Prisma } from '@prisma/client';

export interface InitialDataItem {
  /** Identifica el elemento en la empresa: nombre, tipo de plantilla… */
  key: string;
  /** Sin rubros, va a todas las empresas. */
  industries?: readonly Industry[];
}

export interface InitialDataVersion<T extends InitialDataItem> {
  version: number;
  /** Solo lo que agrega esta versión: lo de versiones anteriores no se repite. */
  items: readonly T[];
}

export interface InitialDataDefinition<T extends InitialDataItem> {
  /** Nombre estable: queda guardado por empresa con la versión aplicada. */
  name: string;
  /** Se aplica solo mientras este módulo esté activo en la empresa. */
  module: string;
  /**
   * La primera vez, si la empresa ya tiene datos de este conjunto:
   * - `keep`: se respeta su lista y no se crea nada;
   * - `fill`: se crea cada elemento que le falte.
   */
  whenExisting: 'keep' | 'fill';
  versions: readonly InitialDataVersion<T>[];
}

/**
 * Lo implementa el módulo dueño de la tabla, en su carpeta `data/`, y se
 * marca con `@InitialData()`.
 */
export interface InitialDataSet<T extends InitialDataItem = InitialDataItem> {
  readonly definition: InitialDataDefinition<T>;
  /** Claves que la empresa ya tiene, incluidas las dadas de baja: no vuelven. */
  existingKeys(
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<ReadonlySet<string>>;
  create(
    tenantId: string,
    items: readonly T[],
    tx: Prisma.TransactionClient,
  ): Promise<void>;
}

export function defineInitialData<T extends InitialDataItem>(
  definition: InitialDataDefinition<T>,
): InitialDataDefinition<T> {
  const versions = definition.versions.map((v) => v.version);
  const ascending = versions.every((v, i) => v === i + 1);
  if (!ascending) {
    throw new Error(
      `Datos iniciales ${definition.name}: las versiones van de 1 en 1 desde 1`,
    );
  }
  return definition;
}

/** Un nombre que se repite en varios rubros queda como un solo elemento. */
export function namesByIndustry(
  names: Partial<Record<Industry, readonly string[]>>,
): InitialDataItem[] {
  const industriesByName = new Map<string, Industry[]>();
  for (const [industry, list] of Object.entries(names) as [
    Industry,
    readonly string[],
  ][]) {
    for (const name of list) {
      industriesByName.set(name, [
        ...(industriesByName.get(name) ?? []),
        industry,
      ]);
    }
  }
  return [...industriesByName].map(([key, industries]) => ({
    key,
    industries,
  }));
}

export function latestVersion(definition: { versions: readonly unknown[] }) {
  return definition.versions.length;
}
