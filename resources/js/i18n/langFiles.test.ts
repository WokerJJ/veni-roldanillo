// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
| JSON.parse se queda con la última de dos claves iguales y no avisa: una clave
| repetida pierde un texto en silencio (así se perdió el autor de los íconos en
| los créditos). Se lee el archivo crudo, que es donde se ve la repetición.
*/
describe.each(['es', 'en'])('lang/%s.json', (locale) => {
    const raw = readFileSync(resolve(process.cwd(), `lang/${locale}.json`), 'utf8');

    it('no repite ninguna clave', () => {
        const keys = [...raw.matchAll(/^\s*"((?:[^"\\]|\\.)+)"\s*:/gm)].map((match) => match[1]);
        const repeated = keys.filter((key, index) => keys.indexOf(key) !== index);

        expect(keys.length).toBeGreaterThan(100);
        expect(repeated).toEqual([]);
    });

    it('los créditos nombran al autor de los íconos (licencia MIT)', () => {
        expect((JSON.parse(raw) as Record<string, string>)['credits.icons']).toContain('Miguel Teheran');
    });
});
