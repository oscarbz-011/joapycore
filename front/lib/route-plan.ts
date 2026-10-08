// Cuánto recorre y cuánto tarda una ruta de entrega, para decidir en qué
// orden conviene hacerla y cuánto le suma una entrega más.
//
// Es una estimación: la distancia sale de las ubicaciones guardadas de los
// clientes, en línea recta y corregida por un factor de calle. No consulta
// ningún servicio de mapas ni conoce el tránsito.

/** Supuestos de la estimación. */
export const ROUTE_ASSUMPTIONS = {
  /** Las calles alargan el camino respecto de la línea recta. */
  roadFactor: 1.3,
  /** Velocidad media en ciudad, con tránsito y semáforos. */
  speedKmh: 25,
  /** Estacionar, bajar el pedido, firmar. */
  minutesPerStop: 15,
};

export interface Point {
  latitude: number | null;
  longitude: number | null;
}

type Located = { latitude: number; longitude: number };

export const isLocated = (point: Point): point is Located =>
  point.latitude !== null && point.longitude !== null;

const EARTH_RADIUS_KM = 6371;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Kilómetros estimados por calle entre dos puntos; null si falta una ubicación. */
export function distanceKm(a: Point, b: Point): number | null {
  if (!isLocated(a) || !isLocated(b)) return null;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)) * ROUTE_ASSUMPTIONS.roadFactor;
}

/** Kilómetros del recorrido pasando por las paradas ubicadas, en orden. */
function pathKm(points: Point[]): number {
  const located = points.filter(isLocated);
  let km = 0;
  for (let i = 1; i < located.length; i += 1) {
    km += distanceKm(located[i - 1], located[i]) ?? 0;
  }
  return km;
}

export interface RouteEstimate {
  stops: number;
  /** Paradas sin ubicación: no suman distancia y la estimación queda corta. */
  unlocated: number;
  km: number;
  travelMinutes: number;
  stopMinutes: number;
  totalMinutes: number;
  /** Km desde la parada ubicada anterior; null en la primera o sin ubicación. */
  legs: (number | null)[];
}

export function routeEstimate(points: Point[]): RouteEstimate {
  const legs: (number | null)[] = [];
  let previous: Located | null = null;
  for (const point of points) {
    if (!isLocated(point)) {
      legs.push(null);
      continue;
    }
    legs.push(previous ? distanceKm(previous, point) : null);
    previous = point;
  }

  const km = legs.reduce<number>((sum, leg) => sum + (leg ?? 0), 0);
  const travelMinutes = Math.round((km / ROUTE_ASSUMPTIONS.speedKmh) * 60);
  const stopMinutes = points.length * ROUTE_ASSUMPTIONS.minutesPerStop;

  return {
    stops: points.length,
    unlocated: points.filter((point) => !isLocated(point)).length,
    km,
    travelMinutes,
    stopMinutes,
    totalMinutes: travelMinutes + stopMinutes,
    legs,
  };
}

export interface Insertion {
  /** Lugar del recorrido donde menos desvía (0 = primera parada). */
  position: number;
  extraKm: number;
  extraMinutes: number;
}

/**
 * Qué le cuesta a una ruta sumar una entrega, poniéndola donde menos desvía.
 * Una entrega sin ubicación va al final y solo suma el tiempo de la parada.
 */
export function bestInsertion(points: Point[], candidate: Point): Insertion {
  let position = points.length;
  let extraKm = 0;

  if (isLocated(candidate)) {
    const baseKm = pathKm(points);
    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index <= points.length; index += 1) {
      const km = pathKm([...points.slice(0, index), candidate, ...points.slice(index)]);
      // Ante un empate gana el lugar más al final: no mueve lo ya ordenado.
      if (km <= best) {
        best = km;
        position = index;
      }
    }
    extraKm = Math.max(0, best - baseKm);
  }

  return {
    position,
    extraKm,
    extraMinutes:
      Math.round((extraKm / ROUTE_ASSUMPTIONS.speedKmh) * 60) + ROUTE_ASSUMPTIONS.minutesPerStop,
  };
}

/**
 * Las paradas ordenadas yendo siempre a la más cercana, a partir de la
 * primera. Las que no tienen ubicación quedan al final, en el orden que tenían.
 */
export function nearestOrder<T extends Point & { id: string }>(stops: T[]): string[] {
  const located = stops.filter(isLocated);
  const unlocated = stops.filter((stop) => !isLocated(stop));
  if (located.length === 0) return stops.map((stop) => stop.id);

  const pending = located.slice(1);
  const ordered = [located[0]];
  while (pending.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearest = 0;
    for (let i = 1; i < pending.length; i += 1) {
      if ((distanceKm(last, pending[i]) ?? 0) < (distanceKm(last, pending[nearest]) ?? 0)) {
        nearest = i;
      }
    }
    ordered.push(...pending.splice(nearest, 1));
  }
  return [...ordered, ...unlocated].map((stop) => stop.id);
}

/** Una parada un lugar antes (-1) o después (+1); sin cambios en los bordes. */
export function moveStop(ids: string[], id: string, direction: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** "45 min", "2 h", "2 h 15 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "12,4 km"; menos de 100 m se muestra como "0,1 km". */
export function formatKm(km: number): string {
  const rounded = km > 0 && km < 0.1 ? 0.1 : km;
  return `${new Intl.NumberFormat('es-PY', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rounded)} km`;
}
