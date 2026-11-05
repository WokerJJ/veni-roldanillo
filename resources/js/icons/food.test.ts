import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { CATEGORIES, categoryIcon, chipIconName, dishIcon, GENERIC_FOOD_ICON, ingredientIcon, normalizeFoodName } from './food';
import { veniIcons } from './veni';

/** Vitest corre desde la raíz del repositorio. */
const ROOT = `${process.cwd()}/`;

/** Como si el autor ya hubiera dibujado estos (los de verdad llegan con el tiempo). */
const DRAWN = new Set(['tomate', 'frijol', 'limon', 'queso', 'platano-maduro', 'pina', 'huevo', 'nuez', 'raiz', 'pepino']);

describe('normalizeFoodName', () => {
    it('quita tildes, mayúsculas, lo que va entre paréntesis y deja guiones', () => {
        expect(normalizeFoodName('Plátano maduro (prueba)')).toBe('platano-maduro');
        expect(normalizeFoodName('  FRÍJOL  ')).toBe('frijol');
        expect(normalizeFoodName('Piña')).toBe('pina');
        expect(normalizeFoodName('Ají / hogao')).toBe('aji-hogao');
    });
});

describe('ingredientIcon', () => {
    it('busca el archivo con el nombre normalizado, sin importar tildes ni mayúsculas', () => {
        expect(ingredientIcon('Tomate', DRAWN)).toBe('veni/tomate');
        expect(ingredientIcon('LIMÓN', DRAWN)).toBe('veni/limon');
        expect(ingredientIcon('Tomate (prueba)', DRAWN)).toBe('veni/tomate');
        expect(ingredientIcon('Piña', DRAWN)).toBe('veni/pina');
    });

    it('prueba el singular y, si no, la primera palabra', () => {
        expect(ingredientIcon('Fríjoles', DRAWN)).toBe('veni/frijol');
        expect(ingredientIcon('Tomates', DRAWN)).toBe('veni/tomate');
        expect(ingredientIcon('Queso costeño', DRAWN)).toBe('veni/queso');
        expect(ingredientIcon('Huevos fritos', DRAWN)).toBe('veni/huevo');
        // -ces es el plural de -z.
        expect(ingredientIcon('Nueces', DRAWN)).toBe('veni/nuez');
        expect(ingredientIcon('Raíces de yuca', DRAWN)).toBe('veni/raiz');
        // El nombre entero gana a la primera palabra.
        expect(ingredientIcon('Plátano maduro', DRAWN)).toBe('veni/platano-maduro');
    });

    it('sin ícono, el genérico', () => {
        expect(ingredientIcon('Cilantro', DRAWN)).toBe(GENERIC_FOOD_ICON);
        expect(ingredientIcon('', DRAWN)).toBe(GENERIC_FOOD_ICON);
        expect(ingredientIcon('(prueba)', DRAWN)).toBe(GENERIC_FOOD_ICON);
    });

    it('con los de la carpeta, el genérico existe', () => {
        expect(ingredientIcon('Un ingrediente que nadie dibujó')).toBe('veni/generico');
    });
});

describe('dishIcon', () => {
    it('el típico de colombia-icons si el nombre lo nombra', () => {
        expect(dishIcon('Sancocho de gallina')).toBe('sancocho');
        expect(dishIcon('Empanadas vallunas')).toBe('empanada');
        expect(dishIcon('Patacones con hogao')).toBe('patacon');
        expect(dishIcon('BANDEJA de prueba')).toBe('bandeja-paisa');
        expect(dishIcon('Chicharrón')).toBe('chicharron');
        expect(dishIcon('Café con leche')).toBe('taza-de-tinto');
    });

    it('el típico solo cuenta si es la primera palabra: «Vino tinto» no es un tinto (BUG-025)', () => {
        expect(dishIcon('Vino tinto')).toBe(GENERIC_FOOD_ICON);
        expect(dishIcon('Jugo con arepa')).toBe(GENERIC_FOOD_ICON);
        expect(dishIcon('Tinto campesino')).toBe('taza-de-tinto');
        expect(dishIcon('Tintos')).toBe('taza-de-tinto');
    });

    it('el más específico gana', () => {
        expect(dishIcon('Arepa de choclo con queso')).toBe('arepa-de-choclo');
        expect(dishIcon('Arepas de huevo')).toBe('arepa-de-huevo');
        expect(dishIcon('Arepa con queso')).toBe('arepa');
    });

    it('un propio con el nombre entero, y si no, el genérico', () => {
        expect(dishIcon('Huevo', DRAWN)).toBe('veni/huevo');
        expect(dishIcon('Lulada', DRAWN)).toBe(GENERIC_FOOD_ICON);
        expect(dishIcon('Jugo de prueba')).toBe(GENERIC_FOOD_ICON);
    });
});

describe('chipIconName (BUG-026)', () => {
    it('el chip dibuja su ingrediente; con reemplazo, el reemplazo; siempre por el nombre en español', () => {
        expect(chipIconName({ kind: 'present', name: 'Tomato', icon: 'Tomate' }, DRAWN)).toBe('veni/tomate');
        expect(chipIconName({ kind: 'missing', name: 'Tomato', icon: 'Tomate' }, DRAWN)).toBe('veni/tomate');
        // El reemplazo, no el que falta: los dos tienen ícono, así que se distinguen.
        expect(chipIconName({ kind: 'swap', name: 'Tomato', substitute: 'Cucumber', price: 500, icon: 'Pepino' }, DRAWN)).toBe('veni/pepino');
        expect(chipIconName({ kind: 'present', name: 'Cilantro', icon: 'Cilantro' }, DRAWN)).toBe(GENERIC_FOOD_ICON);
    });
});

describe('categoryIcon', () => {
    it('las categorías conocidas llevan el suyo; una nueva, el genérico', () => {
        expect(categoryIcon('comida-tipica')).toBe('bandeja-paisa');
        expect(categoryIcon('pescados-mariscos')).toBe('pescado-frito');
        expect(categoryIcon('heladeria-postres')).toBe(GENERIC_FOOD_ICON);
        expect(categoryIcon('vegana')).toBe(GENERIC_FOOD_ICON);
    });
});

describe('lo que nombra el código existe (EVA-025)', () => {
    // Entre comillas: los ejemplos de los comentarios van entre comillas invertidas.
    it('cada «veni/…» escrito en el código es un archivo de resources/icons/veni', () => {
        const dir = `${ROOT}resources/js/`;
        const sources = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => /\.(?:ts|vue)$/.test(file) && !/\.test\.ts$/.test(file));
        const named = new Set(sources.flatMap((file) => [...readFileSync(`${dir}${file}`, 'utf8').matchAll(/['"]veni\/([a-z0-9-]+)['"]/g)].map(([, name]) => name ?? '')));
        const files = new Set(Object.keys(veniIcons).map((file) => file.slice('./veni/'.length, -'.svg'.length)));

        expect(named.size).toBeGreaterThan(0);
        expect([...named].filter((name) => !files.has(name))).toEqual([]);
    });

    it('las categorías con ícono son las de CategorySeeder, ni una más ni una menos', () => {
        const seeder = readFileSync(`${ROOT}database/seeders/CategorySeeder.php`, 'utf8');
        const seeded = [...seeder.matchAll(/^\s*\['([a-z0-9-]+)', '/gm)].map(([, slug]) => slug);

        expect(seeded).toHaveLength(6);
        expect(Object.keys(CATEGORIES).sort()).toEqual(seeded.sort());
    });
});
