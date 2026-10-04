// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { mapCachePattern } from './mapCache';

const STYLE = 'https://wokerjj.github.io/veni-mapa/style/veni-{theme}-{locale}.json';
const ROUTES = 'https://wokerjj.github.io/veni-mapa/roldanillo-rutas.json';
const BASE = 'https://wokerjj.github.io/veni-mapa';

describe('lo que el service worker guarda del mapa', () => {
    const pattern = mapCachePattern(STYLE, ROUTES);

    it.each([
        ['el estilo', `${BASE}/style/veni-claro-es.json`],
        ['los glyphs', `${BASE}/fonts/Figtree%20Regular/0-255.pbf`],
        ['el sprite', `${BASE}/sprites/light.json`],
        ['su imagen', `${BASE}/sprites/light@2x.png`],
        ['con parámetros', `${BASE}/style/veni-oscuro-en.json?v=2`],
    ])('guarda %s', (_name, url) => {
        expect(pattern?.test(url)).toBe(true);
    });

    it.each([
        // Rangos: la Cache API no guarda respuestas 206.
        ['el PMTiles', `${BASE}/roldanillo.pmtiles`],
        ['el grafo de rutas', ROUTES],
        ['el grafo de rutas con parámetros', `${ROUTES}?v=2`],
        ['otro origen', 'https://tiles.example.test/veni-mapa/style/veni-claro-es.json'],
        ['un host que solo se parece', 'https://wokerjjXgithub.io/veni-mapa/style/veni-claro-es.json'],
        ['el origen dentro de otra URL', `https://evil.example.test/?u=${BASE}/style/veni-claro-es.json`],
        ['otros archivos del origen', `${BASE}/index.html`],
        ['un script', `${BASE}/app.js`],
    ])('no guarda %s', (_name, url) => {
        expect(pattern?.test(url)).toBe(false);
    });

    it('con el grafo en otro origen, el del estilo guarda sus .json', () => {
        const other = mapCachePattern(STYLE, 'https://rutas.example.test/roldanillo-rutas.json');

        expect(other?.test(`${BASE}/roldanillo-rutas.json`)).toBe(true);
    });

    it('sin URL del estilo que sirva no hay patrón', () => {
        expect(mapCachePattern(undefined, ROUTES)).toBeNull();
        expect(mapCachePattern('', ROUTES)).toBeNull();
        expect(mapCachePattern('/style/veni-{theme}-{locale}.json')).toBeNull();
        expect(mapCachePattern('javascript://wokerjj.github.io/veni.json')).toBeNull();
    });

    it('sale una expresión que el service worker puede volver a armar', () => {
        // generateSW escribe el patrón en public/sw.js como literal.
        const rebuilt = new RegExp(pattern?.source ?? '', pattern?.flags);

        expect(rebuilt.test(`${BASE}/style/veni-claro-es.json`)).toBe(true);
        expect(rebuilt.test(`${BASE}/roldanillo.pmtiles`)).toBe(false);
    });
});
