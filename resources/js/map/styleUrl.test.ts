import { describe, expect, it, vi } from 'vitest';

import { mapStyleUrl } from './styleUrl';

const TEMPLATE = 'https://tiles.example.test/v0.2.0/style/veni-{theme}-{locale}.json';

describe('mapStyleUrl', () => {
    it.each([
        ['light', 'es', 'veni-claro-es.json'],
        ['light', 'en', 'veni-claro-en.json'],
        ['dark', 'es', 'veni-oscuro-es.json'],
        ['dark', 'en', 'veni-oscuro-en.json'],
    ] as const)('con el tema %s y el idioma %s pide %s', (theme, locale, file) => {
        expect(mapStyleUrl(TEMPLATE, theme, locale)).toBe(`https://tiles.example.test/v0.2.0/style/${file}`);
    });

    it('reemplaza los marcadores en cualquier parte de la URL, las veces que estén', () => {
        const template = 'https://tiles.example.test/{locale}/{theme}/veni-{theme}-{locale}.json';

        expect(mapStyleUrl(template, 'dark', 'en')).toBe('https://tiles.example.test/en/oscuro/veni-oscuro-en.json');
    });

    it('sin marcadores devuelve el estilo fijo y avisa en desarrollo', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fixed = 'https://tiles.example.test/style/veni-claro-es.json';

        expect(mapStyleUrl(fixed, 'dark', 'en')).toBe(fixed);
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0]?.[0]).toContain('VITE_MAP_STYLE_URL');
    });

    it('con la plantilla completa no avisa', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        mapStyleUrl(TEMPLATE, 'light', 'es');

        expect(warn).not.toHaveBeenCalled();
    });

    it.each([undefined, '', '   '])('sin plantilla (%j) lanza un error que nombra la variable', (template) => {
        expect(() => mapStyleUrl(template, 'light', 'es')).toThrow('VITE_MAP_STYLE_URL');
    });
});
