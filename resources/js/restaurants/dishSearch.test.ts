import { afterEach, describe, expect, it, vi } from 'vitest';

import contract from '../../../tests/contracts/dishes.search.json';
import { DISH_SEARCH_ENDPOINT, DISH_SEARCH_TIMEOUT_MS, dishQuery, DishSearchUnavailable, fetchDishes, parseDishResults, withinFilters } from './dishSearch';

function respondWith(status: number, body: unknown = {}) {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
        Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }),
    );
    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('dishQuery', () => {
    it('pide tres letras o más', () => {
        expect(dishQuery('aj')).toBeNull();
        expect(dishQuery('12 3')).toBeNull();
        expect(dishQuery('   ')).toBeNull();
        expect(dishQuery('aji')).toBe('aji');
    });

    it('limpia lo que el servidor no acepta y los espacios de más, sin perder tildes ni eñes', () => {
        expect(dishQuery('  Ajíaco   de la  abuela ')).toBe('Ajíaco de la abuela');
        expect(dishQuery('"sancocho"*')).toBe('sancocho');
        expect(dishQuery('<b>ñame</b>')).toBe('b ñame b');
        expect(dishQuery('Juan’s piña-colada')).toBe("Juan's piña-colada");
    });

    it('corta en el tope del servidor', () => {
        expect(dishQuery('a'.repeat(80))).toHaveLength(60);
    });
});

describe('fetchDishes', () => {
    it('pregunta a nuestro endpoint con la consulta y el idioma en la URL, sin cookies', async () => {
        const fetchMock = respondWith(200, { results: [] });

        await fetchDishes('ajíaco', 'en', new AbortController().signal);

        expect(fetchMock.mock.calls[0]?.[0]).toBe(`${DISH_SEARCH_ENDPOINT}?q=aj%C3%ADaco&lang=en`);
        expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('omit');
    });

    it('lee entera la respuesta del contrato (la misma que prueba el servidor)', async () => {
        respondWith(200, contract);

        await expect(fetchDishes('sancocho', 'es', new AbortController().signal)).resolves.toEqual(
            contract.results.map(({ restaurant, dishes }) => ({ restaurant: { slug: restaurant.slug, name: restaurant.name }, dishes })),
        );
    });

    it('un 503 es «no disponible»; otro error, un error cualquiera', async () => {
        respondWith(503, { error: 'search_unavailable' });
        await expect(fetchDishes('sancocho', 'es', new AbortController().signal)).rejects.toBeInstanceOf(DishSearchUnavailable);

        respondWith(500);
        await expect(fetchDishes('sancocho', 'es', new AbortController().signal)).rejects.toThrow('HTTP 500');
    });

    it('se rinde pasado el plazo', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'fetch',
            vi.fn(
                (_url: string, init?: RequestInit) =>
                    new Promise((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () => {
                            reject(init.signal?.reason as Error);
                        });
                    }),
            ),
        );

        const pending = fetchDishes('sancocho', 'es', new AbortController().signal);
        const expectation = expect(pending).rejects.toThrow('no llegaron');
        await vi.advanceTimersByTimeAsync(DISH_SEARCH_TIMEOUT_MS);
        await expectation;
    });

    it('no pregunta si la señal ya se abortó', async () => {
        const fetchMock = respondWith(200, { results: [] });
        const controller = new AbortController();
        controller.abort();

        await expect(fetchDishes('sancocho', 'es', controller.signal)).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('parseDishResults', () => {
    it('descarta lo que no sirve y rechaza una respuesta sin resultados', () => {
        expect(
            parseDishResults({
                results: [
                    { restaurant: { slug: 'a', name: 'A' }, dishes: [{ id: 1, name: 'Sancocho', price: 9000 }, { name: 'sin id' }] },
                    { restaurant: { slug: 'b' }, dishes: [{ id: 2, name: 'X', price: 1 }] },
                    { restaurant: { slug: 'c', name: 'C' }, dishes: [] },
                ],
            }),
        ).toEqual([{ restaurant: { slug: 'a', name: 'A' }, dishes: [{ id: 1, name: 'Sancocho', description: null, section: null, price: 9000, available: true }] }]);

        expect(() => parseDishResults({ error: 'x' })).toThrow();
    });
});

describe('withinFilters', () => {
    const groups = parseDishResults(contract);

    it('deja solo los restaurantes que cumplen los demás filtros; sin filtro, todos', () => {
        expect(withinFilters(groups, null)).toHaveLength(1);
        expect(withinFilters(groups, new Set(['prueba-la-ceiba']))).toHaveLength(1);
        expect(withinFilters(groups, new Set(['otro']))).toEqual([]);
    });
});
