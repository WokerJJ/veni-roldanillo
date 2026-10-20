/**
 * Grafos de rutas de mentira, en el formato `veni-rutas` v1 que publica
 * veni-mapa (resources/js/routing/veni-mapa/graph.ts): coordenadas enteras
 * (grados × 10⁶) con codificación delta y largos en decímetros.
 */
import type { RoutingGraph } from '@/routing/veni-mapa/graph.ts';
import { distanceM, SCALE } from '@/routing/veni-mapa/graph.ts';

/** Una vía entre dos vértices: por índice, con sus banderas de perfil y sentido y su clase. */
export interface Street {
    from: number;
    to: number;
    /** CAR_FORWARD 1, CAR_BACKWARD 2, FOOT_FORWARD 4, FOOT_BACKWARD 8. */
    flags: number;
    /** Índice en `CLASSES` (11: residential, 16: footway). */
    cls: number;
}

export const RESIDENTIAL = 11;
/** Doble sentido para carros y para quien camina. */
export const BOTH_WAYS = 1 | 2 | 4 | 8;

export function graphOf(points: readonly [number, number][], streets: readonly Street[]): RoutingGraph {
    const nodes: number[] = [];
    let x = 0;
    let y = 0;

    for (const [lon, lat] of points) {
        const nx = Math.round(lon * SCALE);
        const ny = Math.round(lat * SCALE);
        nodes.push(nx - x, ny - y);
        x = nx;
        y = ny;
    }

    const edges = streets.flatMap(({ from, to, flags, cls }) => {
        const [a, b] = [points[from], points[to]];

        if (!a || !b) {
            throw new Error(`La vía ${String(from)}-${String(to)} no tiene sus dos vértices.`);
        }

        return [from, to, Math.round(distanceM(a[0], a[1], b[0], b[1]) * 10), flags, cls];
    });

    return {
        format: 'veni-rutas',
        version: 1,
        region: 'prueba',
        osm_date: '20261001',
        source: 'prueba.osm.pbf',
        source_md5: '0',
        bbox: [-76.3, 4.3, -76, 4.55],
        attribution: '© OpenStreetMap contributors',
        license: 'ODbL-1.0',
        precision: 6,
        classes: [],
        nodes,
        edges,
        geometry: [],
        geometry_counts: streets.map(() => 0),
    };
}

/**
 * Una calle recta de oriente a occidente en el centro de Roldanillo, de
 * -76.160 a -76.150 (unos 1,1 km), con un cruce cada 0.001° (unos 110 m).
 */
export const MAIN_STREET_POINTS: [number, number][] = Array.from({ length: 11 }, (_, index) => [-76.16 + index * 0.001, 4.4128]);

export const MAIN_STREET = graphOf(
    MAIN_STREET_POINTS,
    MAIN_STREET_POINTS.slice(1).map((_, index) => ({ from: index, to: index + 1, flags: BOTH_WAYS, cls: RESIDENTIAL })),
);
