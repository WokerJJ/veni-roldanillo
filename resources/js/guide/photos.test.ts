import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { LICENSES, PHOTO_CREDITS, photoCredit, sourceUrl } from './photoCredits';
import { guidePhoto, photographedDishes } from './photos';

const DIR = 'resources/images/guia';

/** Los ids de los platos de la guía, como los escribe lang/es/guide.php. */
function guideDishes(): string[] {
    const source = readFileSync('lang/es/guide.php', 'utf8');

    return [...source.matchAll(/^ {16}'([a-z-]+)' => \[$/gm)].map((match) => match[1] ?? '');
}

describe('fotos de la guía de platos (#143, ADR 0045)', () => {
    it('cada foto es de un plato de la guía y cada crédito tiene sus dos tamaños en WebP', () => {
        const dishes = guideDishes();

        expect(dishes.length).toBeGreaterThanOrEqual(10);
        for (const credit of PHOTO_CREDITS) {
            expect(dishes, credit.dish).toContain(credit.dish);
            expect(existsSync(`${DIR}/${credit.dish}-480.webp`), `${credit.dish} 480`).toBe(true);
            expect(existsSync(`${DIR}/${credit.dish}-960.webp`), `${credit.dish} 960`).toBe(true);
        }
    });

    it('no hay fotos sueltas sin crédito: toda foto dice quién la hizo', () => {
        const files = readdirSync(DIR).filter((name) => name.endsWith('.webp'));
        const ids = new Set(files.map((name) => name.replace(/-(480|960)\.webp$/, '')));

        expect([...ids].sort()).toEqual(PHOTO_CREDITS.map((credit) => credit.dish).sort());
        expect(files).toHaveLength(PHOTO_CREDITS.length * 2);
    });

    it('solo licencias abiertas que dejan adaptar y publicar: ninguna NC ni ND, y cada crédito dice autor y archivo', () => {
        for (const credit of PHOTO_CREDITS) {
            const license = LICENSES[credit.license];

            expect(license.label, credit.dish).toMatch(/^(CC BY(-SA)? \d\.\d|Dominio público)$/);
            expect(license.label).not.toMatch(/NC|ND/);
            expect(credit.author.trim(), credit.dish).not.toBe('');
            expect(credit.file.trim(), credit.dish).not.toBe('');
        }
    });

    it('cada plato con foto da su dirección en Wikimedia Commons, con el archivo escrito como lo pide', () => {
        expect(sourceUrl('Cholado jamundi.jpg')).toBe('https://commons.wikimedia.org/wiki/File:Cholado_jamundi.jpg');
        expect(sourceUrl("Rue de l'art, Cali 35.jpg")).toBe("https://commons.wikimedia.org/wiki/File:Rue_de_l'art%2C_Cali_35.jpg");
        for (const credit of PHOTO_CREDITS) {
            expect(sourceUrl(credit.file)).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:[^ ]+$/);
        }
    });

    it('guidePhoto trae la dirección y los dos anchos; sin foto, null', () => {
        const photo = guidePhoto('sancocho-de-gallina');

        expect(photo?.src).toContain('sancocho-de-gallina-960');
        expect(photo?.srcset).toMatch(/sancocho-de-gallina-480.+ 480w, .+sancocho-de-gallina-960.+ 960w$/);
        expect(guidePhoto('desamargado')).toBeNull();
        expect(photoCredit('desamargado')).toBeNull();
        expect(photographedDishes().sort()).toEqual(PHOTO_CREDITS.map((credit) => credit.dish).sort());
    });

    it('las fotos pesan poco: 480 a menos de 50 kB y 960 a menos de 210 kB', () => {
        for (const credit of PHOTO_CREDITS) {
            expect(readFileSync(`${DIR}/${credit.dish}-480.webp`).length, `${credit.dish} 480`).toBeLessThan(50 * 1024);
            expect(readFileSync(`${DIR}/${credit.dish}-960.webp`).length, `${credit.dish} 960`).toBeLessThan(210 * 1024);
        }
    });
});
