// @vitest-environment node
import type { Logger } from 'vite';
import { resolveConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { missingStylePlaceholders } from './styleTemplate';

/*
| VITE_MAP_STYLE_URL es una plantilla (ADR 0007). Con una URL fija, como la de
| un .env anterior a los marcadores, el mapa se queda en un solo tema y un solo
| idioma sin que nada falle. Vite escribe la variable en el JavaScript al
| compilar: ese es el momento de avisar. Aquí se carga vite.config.ts de
| verdad, sin compilar.
*/

const TEMPLATE = 'https://tiles.example.test/style/veni-{theme}-{locale}.json';
const FIXED = 'https://tiles.example.test/style/veni-claro-es.json';

/** Lo que vite.config.ts hace al resolverse, con lo que haya avisado por el camino. */
async function configure(command: 'build' | 'serve') {
    const warnings: string[] = [];
    const logger: Logger = {
        hasWarned: false,
        info: () => undefined,
        warn: (message) => {
            warnings.push(message);
        },
        warnOnce: () => undefined,
        error: () => undefined,
        clearScreen: () => undefined,
        hasErrorLogged: () => false,
    };

    await resolveConfig({ customLogger: logger }, command);

    return warnings.filter((warning) => warning.includes('VITE_MAP_STYLE_URL'));
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('marcadores de la plantilla del estilo', () => {
    it.each([
        [TEMPLATE, []],
        ['https://tiles.example.test/{locale}/veni-{theme}.json', []],
        ['https://tiles.example.test/style/veni-{theme}-es.json', ['{locale}']],
        ['https://tiles.example.test/style/veni-claro-{locale}.json', ['{theme}']],
        [FIXED, ['{theme}', '{locale}']],
    ])('a %s le faltan %j', (template, missing) => {
        expect(missingStylePlaceholders(template)).toEqual(missing);
    });
});

describe('vite.config.ts revisa VITE_MAP_STYLE_URL', () => {
    it('con la plantilla completa compila sin avisos', async () => {
        vi.stubEnv('VITE_MAP_STYLE_URL', TEMPLATE);

        expect(await configure('build')).toEqual([]);
    });

    it.each([
        [FIXED, '{theme} ni {locale}'],
        ['https://tiles.example.test/style/veni-{theme}-es.json', '{locale}'],
    ])('con %s se niega a compilar y dice qué falta', async (template, missing) => {
        vi.stubEnv('VITE_MAP_STYLE_URL', template);

        await expect(configure('build')).rejects.toThrow(`VITE_MAP_STYLE_URL no trae ${missing}`);
    });

    it('en desarrollo no se detiene: avisa en la terminal', async () => {
        vi.stubEnv('VITE_MAP_STYLE_URL', FIXED);
        // El plugin de Laravel se niega a resolver el modo «serve» si detecta CI.
        vi.stubEnv('LARAVEL_BYPASS_ENV_CHECK', '1');

        const warnings = await configure('serve');

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('{theme} ni {locale}');
    });

    it('sin la variable compila (CI no tiene .env) y avisa de que el mapa no va a cargar', async () => {
        vi.stubEnv('VITE_MAP_STYLE_URL', '');

        const warnings = await configure('build');

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('no está definida');
    });
});
