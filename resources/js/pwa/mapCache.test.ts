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

    it('guarda también lo de una versión publicada', () => {
        expect(pattern?.test(`${BASE}/v0.2.0/style/veni-claro-es.json`)).toBe(true);
    });

    it('sale una expresión que el service worker puede volver a armar', () => {
        // generateSW escribe el patrón en public/sw.js como literal.
        const rebuilt = new RegExp(pattern?.source ?? '', pattern?.flags);

        expect(rebuilt.test(`${BASE}/style/veni-claro-es.json`)).toBe(true);
        expect(rebuilt.test(`${BASE}/roldanillo.pmtiles`)).toBe(false);
    });
});

/*
| Con la versión en la ruta (…/v0.2.0/…) un archivo del mapa no cambia nunca;
| sin ella, la misma URL trae otra cosa después de cada release de veni-mapa.
| El service worker los trata distinto (runtimeCaching.ts).
*/
describe('el mapa con la versión en la ruta y sin ella', () => {
    const released = mapCachePattern(STYLE, ROUTES, { versioned: true });
    const moving = mapCachePattern(STYLE, ROUTES, { versioned: false });

    it.each([
        ['el estilo de una versión', `${BASE}/v0.2.0/style/veni-claro-es.json`],
        ['sus glyphs', `${BASE}/v0.2.0/fonts/Figtree%20Regular/0-255.pbf`],
        ['la versión justo después del host', 'https://wokerjj.github.io/v1.10.3/sprites/light@2x.png'],
        ['con parámetros', `${BASE}/v0.2.0/sprites/light.json?v=2`],
    ])('tiene versión: %s', (_name, url) => {
        expect(released?.test(url)).toBe(true);
        expect(moving?.test(url)).toBe(false);
    });

    it.each([
        ['el estilo sin versión', `${BASE}/style/veni-claro-es.json`],
        ['una versión a medias', `${BASE}/v0.2/style/veni-claro-es.json`],
        ['una versión que no es una carpeta', `${BASE}/style/veni-v0.2.0.json`],
        ['la versión solo en los parámetros', `${BASE}/style/veni-claro-es.json?from=/v0.2.0/`],
    ])('no tiene versión: %s', (_name, url) => {
        expect(released?.test(url)).toBe(false);
        expect(moving?.test(url)).toBe(true);
    });

    it.each([
        ['el PMTiles', `${BASE}/v0.2.0/roldanillo.pmtiles`],
        ['otro origen', 'https://tiles.example.test/v0.2.0/style/veni-claro-es.json'],
    ])('con versión tampoco guarda %s', (_name, url) => {
        expect(released?.test(url)).toBe(false);
    });

    it('con versión tampoco guarda el grafo de rutas', () => {
        const release = `${BASE}/v0.2.0`;
        const pattern = mapCachePattern(`${release}/style/veni-{theme}-{locale}.json`, `${release}/roldanillo-rutas.json`, { versioned: true });

        expect(pattern?.test(`${release}/roldanillo-rutas.json`)).toBe(false);
        expect(pattern?.test(`${release}/sprites/light.json`)).toBe(true);
    });

    it('se puede pedir solo algunos tipos de archivo', () => {
        const lists = mapCachePattern(STYLE, ROUTES, { versioned: false, files: ['json'] });
        const images = mapCachePattern(STYLE, ROUTES, { versioned: false, files: ['pbf', 'png', 'webp'] });

        expect(lists?.test(`${BASE}/sprites/light.json`)).toBe(true);
        expect(lists?.test(`${BASE}/sprites/light@2x.png`)).toBe(false);
        expect(images?.test(`${BASE}/sprites/light@2x.png`)).toBe(true);
        expect(images?.test(`${BASE}/fonts/Figtree%20Regular/0-255.pbf`)).toBe(true);
        expect(images?.test(`${BASE}/sprites/light.json`)).toBe(false);
    });
});
