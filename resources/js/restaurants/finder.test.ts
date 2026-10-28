import { describe, expect, it } from 'vitest';

import { EL_GUADUAL, LA_CEIBA, restaurant } from '@/testing/restaurants';

import { categoriesOf, filterRestaurants, matchesQuery, normalizeText, pickSuggestion, todaysLunches, withoutUnknownCategory } from './finder';
import { NO_FILTERS } from './filterParams';

/** Miércoles 7 de octubre de 2026, 12:00 en Colombia: La Ceiba (11–15) abierta, El Guadual (18–02) cerrado. */
const NOON = new Date('2026-10-07T17:00:00Z');
/** El mismo día a las 20:00: al revés. */
const NIGHT = new Date('2026-10-08T01:00:00Z');

const SIN_HORARIO = restaurant({ slug: 'prueba-sin-horario', name: 'Fonda Sin Horario (ficticio)', hours: [], categories: [], price_level: 4 });
const ALL = [LA_CEIBA, EL_GUADUAL, SIN_HORARIO];

const slugs = (list: readonly { slug: string }[]): string[] => list.map(({ slug }) => slug);

describe('normalizeText', () => {
    it('quita tildes, mayúsculas y espacios de más', () => {
        expect(normalizeText('  Comida   TÍPICA  ')).toBe('comida tipica');
        expect(normalizeText('Fogón Azul · Ñame')).toBe('fogon azul · name');
    });

    it('unifica los apóstrofos y comillas del teclado del celular y quita los caracteres invisibles', () => {
        for (const apostrophe of ['\u2019', '\u2018', '\u02BC', '`', '\u00B4']) {
            expect(normalizeText(`Juan${apostrophe}s`)).toBe("juan's");
        }

        expect(normalizeText('Ca\u200Bfé\u200C de\u200D Juan')).toBe('cafe de juan');
        // Compatibilidad: la ligadura «ﬁ» y el «²» volado se escriben como letras comunes.
        expect(normalizeText('Ｃaﬁ²')).toBe('cafi2');
    });
});

describe('matchesQuery', () => {
    it('vacío o con solo espacios responde a todos', () => {
        expect(matchesQuery(LA_CEIBA, '')).toBe(true);
        expect(matchesQuery(LA_CEIBA, '   ')).toBe(true);
    });

    it('encuentra por nombre sin importar tildes ni mayúsculas', () => {
        expect(matchesQuery(LA_CEIBA, 'CEIBA')).toBe(true);
        expect(matchesQuery(restaurant({ name: 'El Fogón Azul' }), 'fogon')).toBe(true);
        expect(matchesQuery(restaurant({ name: 'El Fogon Azul' }), 'fogón')).toBe(true);
    });

    it('encuentra por el nombre de una categoría', () => {
        expect(matchesQuery(LA_CEIBA, 'tipica')).toBe(true);
        expect(matchesQuery(EL_GUADUAL, 'rapidas')).toBe(true);
        expect(matchesQuery(LA_CEIBA, 'asados')).toBe(false);
    });

    it('cada palabra tiene que estar, en cualquier orden y entre nombre y categoría', () => {
        expect(matchesQuery(LA_CEIBA, 'tipica ceiba')).toBe(true);
        expect(matchesQuery(LA_CEIBA, 'ceiba asados')).toBe(false);
    });

    it("«juan’s» con el apóstrofo curvo del celular encuentra a «Donde Juan's», y al revés", () => {
        expect(matchesQuery(restaurant({ name: "Donde Juan's" }), 'juan\u2019s')).toBe(true);
        expect(matchesQuery(restaurant({ name: 'Donde Juan\u2019s' }), "juan's")).toBe(true);
    });
});

describe('filterRestaurants', () => {
    it('sin filtros devuelve todos, en el mismo orden', () => {
        expect(slugs(filterRestaurants(ALL, NO_FILTERS, NOON))).toEqual(slugs(ALL));
    });

    it('abierto ahora usa la hora de Colombia y deja fuera a los que no tienen horario', () => {
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, open: true }, NOON))).toEqual([LA_CEIBA.slug]);
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, open: true }, NIGHT))).toEqual([EL_GUADUAL.slug]);
    });

    it('domicilio deja solo a los que hacen', () => {
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, delivery: true }, NOON))).toEqual([LA_CEIBA.slug, SIN_HORARIO.slug]);
    });

    it('el precio es «hasta ese nivel», y deja fuera a los que no lo cargaron', () => {
        // La Ceiba es $$, El Guadual no lo cargó y la fonda es $$$$.
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, price: 1 }, NOON))).toEqual([]);
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, price: 2 }, NOON))).toEqual([LA_CEIBA.slug]);
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, price: 4 }, NOON))).toEqual([LA_CEIBA.slug, SIN_HORARIO.slug]);
    });

    it('la categoría va por slug', () => {
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, category: 'asados' }, NOON))).toEqual([EL_GUADUAL.slug]);
    });

    it('los filtros se suman: todos tienen que cumplirse', () => {
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, query: 'prueba', delivery: true, open: true }, NOON))).toEqual([LA_CEIBA.slug]);
        expect(filterRestaurants(ALL, { ...NO_FILTERS, query: 'guadual', delivery: true }, NOON)).toEqual([]);
    });
});

describe('categoriesOf', () => {
    it('sin repetir y por nombre', () => {
        const otra = restaurant({ slug: 'otra', categories: [{ slug: 'asados', name: 'Asados' }] });

        expect(categoriesOf([LA_CEIBA, EL_GUADUAL, otra], 'es')).toEqual([
            { slug: 'asados', name: 'Asados' },
            { slug: 'comida-tipica', name: 'Comida típica' },
            { slug: 'comidas-rapidas', name: 'Comidas rápidas' },
        ]);
    });
});

describe('withoutUnknownCategory', () => {
    it('saca la categoría que ninguno tiene (un enlace viejo o mal armado) y deja los demás filtros', () => {
        expect(withoutUnknownCategory({ ...NO_FILTERS, delivery: true, category: 'no-existe' }, ALL)).toEqual({ ...NO_FILTERS, delivery: true });
    });

    it('con una categoría que alguno tiene, sin categoría o sin restaurantes todavía, no cambia nada (null)', () => {
        expect(withoutUnknownCategory({ ...NO_FILTERS, category: 'comida-tipica' }, ALL)).toBeNull();
        expect(withoutUnknownCategory(NO_FILTERS, ALL)).toBeNull();
        expect(withoutUnknownCategory({ ...NO_FILTERS, category: 'no-existe' }, [])).toBeNull();
    });
});

describe('todaysLunches', () => {
    const lunch = (date: string, price: number) => ({ date, description: 'Almuerzo de prueba', price });

    it('solo los de hoy en Colombia, del más barato al más caro', () => {
        const caro = restaurant({ slug: 'caro', lunch: lunch('2026-10-07', 18000) });
        const barato = restaurant({ slug: 'barato', lunch: lunch('2026-10-07', 12000) });
        const ayer = restaurant({ slug: 'ayer', lunch: lunch('2026-10-06', 9000) });

        expect(todaysLunches([caro, LA_CEIBA, ayer, barato], NOON).map(({ restaurant: { slug }, lunch: { price } }) => [slug, price])).toEqual([
            ['barato', 12000],
            ['caro', 18000],
        ]);
    });

    it('a las 23:30 de Colombia sigue siendo hoy aunque en UTC ya sea mañana', () => {
        const hoy = restaurant({ slug: 'hoy', lunch: lunch('2026-10-07', 12000) });

        expect(todaysLunches([hoy], new Date('2026-10-08T04:30:00Z'))).toHaveLength(1);
        expect(todaysLunches([hoy], new Date('2026-10-08T05:00:00Z'))).toHaveLength(0);
    });
});

describe('pickSuggestion', () => {
    const abiertos = [LA_CEIBA, restaurant({ slug: 'segundo' }), restaurant({ slug: 'tercero' })];

    it('elige entre los abiertos con el azar que se le pasa', () => {
        expect(pickSuggestion([EL_GUADUAL, ...abiertos], NOON, () => 0)?.slug).toBe(LA_CEIBA.slug);
        expect(pickSuggestion([EL_GUADUAL, ...abiertos], NOON, () => 0.5)?.slug).toBe('segundo');
        expect(pickSuggestion([EL_GUADUAL, ...abiertos], NOON, () => 0.999)?.slug).toBe('tercero');
    });

    it('un azar fuera de rango no se sale de la lista', () => {
        expect(pickSuggestion(abiertos, NOON, () => 1)?.slug).toBe('tercero');
        expect(pickSuggestion(abiertos, NOON, () => -1)?.slug).toBe(LA_CEIBA.slug);
    });

    it('sin abiertos devuelve null', () => {
        expect(pickSuggestion([EL_GUADUAL, SIN_HORARIO], NOON, () => 0)).toBeNull();
        expect(pickSuggestion([], NOON)).toBeNull();
    });

    it('no repite el último sugerido si hay otro abierto; si es el único, lo vuelve a sugerir', () => {
        expect(pickSuggestion(abiertos, NOON, () => 0, LA_CEIBA.slug)?.slug).toBe('segundo');
        expect(pickSuggestion(abiertos, NOON, () => 0.999, 'tercero')?.slug).toBe('segundo');
        expect(pickSuggestion([EL_GUADUAL, LA_CEIBA], NOON, () => 0, LA_CEIBA.slug)?.slug).toBe(LA_CEIBA.slug);
        expect(pickSuggestion(abiertos, NOON, () => 0, 'cerrado-o-ajeno')?.slug).toBe(LA_CEIBA.slug);
    });
});
