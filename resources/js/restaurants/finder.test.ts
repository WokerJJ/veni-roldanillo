import { describe, expect, it } from 'vitest';

import { EL_GUADUAL, LA_CEIBA, restaurant } from '@/testing/restaurants';

import {
    categoriesOf,
    filterRestaurants,
    firstToOpen,
    filtersFromUrl,
    matchesQuery,
    normalizeText,
    opensListFromUrl,
    pickSuggestion,
    todaysLunches,
    withoutUnknownCategory,
} from './finder';
import { NO_FILTERS } from './filterParams';

/** Miércoles 7 de octubre de 2026, 12:00 en Colombia: La Ceiba (11–15) abierta, El Guadual (18–02) cerrado. */
const NOON = new Date('2026-10-07T17:00:00Z');
/** El mismo día a las 20:00: al revés. */
const NIGHT = new Date('2026-10-08T01:00:00Z');

const SIN_HORARIO = restaurant({ slug: 'prueba-sin-horario', name: 'Fonda Sin Horario (ficticio)', hours: [], categories: [], price_range: { min: 30_000, max: 60_000 } });
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

    it('«platos hasta $X» pide un plato de la carta hasta ese precio, y deja fuera a los que no tienen carta', () => {
        // La Ceiba va de $16.000 a $22.000, El Guadual no tiene carta y la fonda va de $30.000 a $60.000.
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, price: 15_000 }, NOON))).toEqual([]);
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, price: 25_000 }, NOON))).toEqual([LA_CEIBA.slug]);
        expect(slugs(filterRestaurants(ALL, { ...NO_FILTERS, price: 40_000 }, NOON))).toEqual([LA_CEIBA.slug, SIN_HORARIO.slug]);
    });

    it('el tope es inclusivo: el plato más barato puede costar justo eso', () => {
        const justo = restaurant({ slug: 'prueba-justo', price_range: { min: 15_000, max: 15_000 } });

        expect(slugs(filterRestaurants([justo], { ...NO_FILTERS, price: 15_000 }, NOON))).toEqual(['prueba-justo']);
        expect(slugs(filterRestaurants([justo], { ...NO_FILTERS, price: 14_999 }, NOON))).toEqual([]);
    });

    describe('el almuerzo de hoy también cuenta para «platos hasta $X»', () => {
        const lunch = (date: string, price: number) => ({ date, description: 'Almuerzo de prueba', price });

        it('pasa con solo el almuerzo de hoy, sin carta', () => {
            const soloAlmuerzo = restaurant({ slug: 'solo-almuerzo', price_range: null, lunch: lunch('2026-10-07', 12_000) });

            expect(slugs(filterRestaurants([soloAlmuerzo], { ...NO_FILTERS, price: 15_000 }, NOON))).toEqual(['solo-almuerzo']);
        });

        it('pasa si el almuerzo es más barato que la carta', () => {
            const almuerzoBarato = restaurant({ slug: 'almuerzo-barato', price_range: { min: 18_000, max: 30_000 }, lunch: lunch('2026-10-07', 14_000) });

            expect(slugs(filterRestaurants([almuerzoBarato], { ...NO_FILTERS, price: 15_000 }, NOON))).toEqual(['almuerzo-barato']);
        });

        it('no pasa si ni la carta ni el almuerzo llegan', () => {
            const caro = restaurant({ slug: 'caro', price_range: { min: 18_000, max: 30_000 }, lunch: lunch('2026-10-07', 16_000) });
            const sinNada = restaurant({ slug: 'sin-nada', price_range: null, lunch: null });

            expect(slugs(filterRestaurants([caro, sinNada], { ...NO_FILTERS, price: 15_000 }, NOON))).toEqual([]);
        });

        it('el almuerzo de ayer no cuenta', () => {
            const ayer = restaurant({ slug: 'ayer', price_range: null, lunch: lunch('2026-10-06', 9_000) });

            expect(slugs(filterRestaurants([ayer], { ...NO_FILTERS, price: 15_000 }, NOON))).toEqual([]);
        });
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

describe('firstToOpen (#138, A1)', () => {
    // A las 12:00 de Colombia (NOON): La Ceiba (11–15) abierta, El Guadual (18–02) cerrado.
    const temprano = restaurant({ slug: 'abre-a-las-cuatro', hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '16:00', closes: '20:00' })) });
    const manana = restaurant({ slug: 'abre-manana', hours: [{ weekday: 4, opens: '07:00', closes: '10:00' }] });
    const sinHorario = restaurant({ slug: 'sin-horario', hours: [] });

    it('entre los cerrados, el que abre antes: hoy antes que mañana y, el mismo día, la hora más temprana', () => {
        expect(firstToOpen([EL_GUADUAL, manana, temprano], NOON)?.slug).toBe('abre-a-las-cuatro');
        expect(firstToOpen([manana, EL_GUADUAL], NOON)?.slug).toBe(EL_GUADUAL.slug);
    });

    it('deja fuera a los abiertos y a los que no tienen horario; sin ninguno que abra, null', () => {
        expect(firstToOpen([LA_CEIBA, sinHorario], NOON)).toBeNull();
        expect(firstToOpen([], NOON)).toBeNull();
    });

    it('si dos abren a la vez, el primero en el orden en que llegaron', () => {
        const otro = restaurant({ ...temprano, slug: 'otro-a-las-cuatro' });

        expect(firstToOpen([otro, temprano], NOON)?.slug).toBe('otro-a-las-cuatro');
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

describe('opensListFromUrl (#21)', () => {
    it('los filtros que trajo la dirección abren la lista una sola vez; sin filtros, o con otros, no', () => {
        const fromUrl = filtersFromUrl('/?q=sancocho');

        expect(opensListFromUrl(fromUrl)).toBe(true);
        expect(opensListFromUrl(fromUrl)).toBe(false);
        expect(opensListFromUrl(filtersFromUrl('/?lang=es'))).toBe(false);
        expect(opensListFromUrl({ ...filtersFromUrl('/?q=sancocho') })).toBe(false);
        expect(opensListFromUrl(null)).toBe(false);
    });
});
