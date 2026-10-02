import type { AddProtocolAction } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeMapLibre from '@/testing/maplibre';

/*
| El motor con PMTiles de verdad (MapLibre sigue siendo el doble: happy-dom no
| tiene WebGL). PMTiles guarda en memoria la cabecera y los índices del
| archivo, también cuando la descarga falla: estas pruebas miran lo que sale
| por la red al reintentar. En MapView.test.ts PMTiles es un doble y este
| comportamiento no se ve.
*/

vi.mock('maplibre-gl', () => import('@/testing/maplibre'));

const STYLE_URL = 'https://tiles.example.test/style/veni-claro-es.json';
const ARCHIVE_URL = 'https://tiles.example.test/roldanillo.pmtiles';
const STYLE = {
    version: 8,
    center: [-76.1547, 4.4128],
    zoom: 13.5,
    sources: { protomaps: { type: 'vector', url: `pmtiles://${ARCHIVE_URL}` } },
    layers: [],
};

/** Un PMTiles mínimo y válido: la cabecera (127 bytes) y un índice raíz vacío. */
function archiveBytes(): ArrayBuffer {
    const bytes = new Uint8Array(128);
    const view = new DataView(bytes.buffer);

    bytes.set(new TextEncoder().encode('PMTiles'));
    view.setUint8(7, 3); // versión de la especificación
    view.setUint32(8, 127, true); // dónde empieza el índice raíz
    view.setUint32(16, 1, true); // y cuánto mide
    view.setUint8(97, 1); // índices sin comprimir
    view.setUint8(98, 1); // tiles sin comprimir
    view.setUint8(99, 1); // tiles vectoriales (MVT)
    view.setUint8(101, 14); // zoom máximo
    view.setInt32(102, -763000000, true); // oeste
    view.setInt32(106, 43000000, true); // sur
    view.setInt32(110, -760000000, true); // este
    view.setInt32(114, 45500000, true); // norte

    return bytes.buffer;
}

/** La red: el estilo siempre llega; el PMTiles, lo que diga `archive` en cada petición. */
function stubNetwork(archive: () => Promise<ArrayBuffer>) {
    const fetchMock = vi.fn((url: string) => {
        if (url === ARCHIVE_URL) {
            return archive().then((body) => ({
                status: 206,
                headers: new Headers(),
                arrayBuffer: () => Promise.resolve(body),
            }));
        }

        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(STYLE) });
    });

    vi.stubGlobal('fetch', fetchMock);

    return { archiveRequests: () => fetchMock.mock.calls.filter(([url]) => url === ARCHIVE_URL).length };
}

async function setUp() {
    const maplibre = (await import('maplibre-gl')) as unknown as typeof FakeMapLibre;
    maplibre.reset();
    const { createMap } = await import('./engine');
    const { fetchMapStyle } = await import('./fetchStyle');

    return {
        maplibre,
        /** Crea un mapa y devuelve lo que MapLibre tendría entre manos: el mapa y la función que le lee el PMTiles. */
        open: async () => {
            const controller = new AbortController();
            const index = maplibre.maps.length;
            const created = createMap({
                container: document.createElement('div'),
                style: fetchMapStyle(STYLE_URL, controller.signal),
                labels: { canvas: 'Mapa', zoomIn: 'Acercar', zoomOut: 'Alejar' },
                signal: controller.signal,
            });

            await vi.waitFor(() => {
                expect(maplibre.maps.length).toBeGreaterThan(index);
            });

            return {
                created,
                controller,
                map: maplibre.maps[index] as FakeMapLibre.Map,
                readArchive: maplibre.addProtocol.mock.calls.at(-1)?.[1] as AddProtocolAction,
            };
        },
    };
}

beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false })),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('motor del mapa con PMTiles de verdad', () => {
    it('tras fallar la cabecera, reintentar vuelve a pedir el .pmtiles', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let online = false;
        const network = stubNetwork(() => (online ? Promise.resolve(archiveBytes()) : Promise.reject(new TypeError('Failed to fetch'))));
        const { open } = await setUp();

        // Primer intento, sin señal: MapLibre pide la fuente y la cabecera no llega.
        const first = await open();
        const tileJson = { url: `pmtiles://${ARCHIVE_URL}`, type: 'json' } as const;
        const failure = await first.readArchive(tileJson, new AbortController()).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(TypeError);
        expect(network.archiveRequests()).toBe(1);

        first.map.fire('error', { error: failure, sourceId: 'protomaps' });
        first.map.fire('load');
        await expect(first.created).rejects.toThrow('fuente de tiles');

        // «Reintentar», ya con señal: otro mapa, que vuelve a pedir el archivo.
        online = true;
        const second = await open();
        const source = await second.readArchive(tileJson, new AbortController());

        expect(network.archiveRequests()).toBe(2);
        expect(source.data).toMatchObject({ tiles: [`pmtiles://${ARCHIVE_URL}/{z}/{x}/{y}`], maxzoom: 14 });

        second.controller.abort();
        await expect(second.created).rejects.toThrow();
    });

    it('si MapLibre cancela la petición, no se descarta lo que PMTiles ya tiene en memoria', async () => {
        const network = stubNetwork(() => Promise.resolve(archiveBytes()));
        const { open } = await setUp();
        const { readArchive, controller, created } = await open();
        const tileJson = { url: `pmtiles://${ARCHIVE_URL}`, type: 'json' } as const;

        await readArchive(tileJson, new AbortController());

        // Un tile que MapLibre deja de necesitar (el usuario movió el mapa).
        const cancelled = new AbortController();
        cancelled.abort();
        await expect(readArchive({ url: `pmtiles://${ARCHIVE_URL}/14/4725/7998`, type: 'arrayBuffer' }, cancelled)).rejects.toThrow();

        // La cabecera sigue en memoria: no se vuelve a pedir.
        await readArchive(tileJson, new AbortController());
        expect(network.archiveRequests()).toBe(1);

        controller.abort();
        await expect(created).rejects.toThrow();
    });
});
