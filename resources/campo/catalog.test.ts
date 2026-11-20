import { describe, expect, it } from 'vitest';

import contract from '../../tests/contracts/dish-name.json';
import type { Catalog, CatalogGroup } from './catalog';
import {
    brandsOf,
    dishesOfGroup,
    dishName,
    formatPesos,
    isSelected,
    labelOf,
    normalizedName,
    parsePrice,
    removeDish,
    renameDish,
    setDishPrice,
    setLabelPrice,
    toggleVariant,
} from './catalog';
import type { MenuSection } from './draft';

/*
| Armar la carta con el catálogo (ADR 0049): marcar presentaciones, poner el
| precio de una vez por tamaño y no dejar nada a medias. Las funciones son
| puras: cada una devuelve una carta nueva.
*/

const SODAS: CatalogGroup = {
    id: 1,
    slug: 'gaseosas',
    name_es: 'Gaseosas',
    name_en: 'Soft drinks',
    section_name_es: 'Bebidas',
    section_name_en: 'Drinks',
    is_alcohol: false,
    items: [
        {
            id: 10,
            brand: 'Postobón',
            name_es: 'Manzana',
            name_en: 'Apple',
            is_alcohol: false,
            variants: [
                { id: 100, label: '400 ml' },
                { id: 101, label: '1,5 L' },
            ],
        },
        { id: 11, brand: 'Postobón', name_es: 'Colombiana', name_en: null, is_alcohol: false, variants: [{ id: 110, label: '400 ml' }] },
        { id: 12, brand: 'Coca-Cola', name_es: 'Coca-Cola', name_en: null, is_alcohol: false, variants: [{ id: 120, label: '400 ml' }] },
    ],
};

const BEERS: CatalogGroup = {
    id: 2,
    slug: 'cervezas',
    name_es: 'Cervezas',
    name_en: 'Beers',
    section_name_es: 'Cervezas',
    section_name_en: 'Beers',
    is_alcohol: true,
    items: [{ id: 20, brand: 'Águila', name_es: 'Cerveza Águila', name_en: 'Águila beer', is_alcohol: true, variants: [{ id: 200, label: 'Botella 330 ml' }] }],
};

const EXTRAS: CatalogGroup = {
    id: 3,
    slug: 'adicionales',
    name_es: 'Adicionales',
    name_en: 'Extras',
    section_name_es: 'Adicionales',
    section_name_en: 'Extras',
    is_alcohol: false,
    items: [{ id: 30, brand: null, name_es: 'Arroz', name_en: 'Rice', is_alcohol: false, variants: [] }],
};

const CATALOG: Catalog = { version: 'v1', groups: [SODAS, BEERS, EXTRAS] };

/** El primer elemento, o falla la prueba: sin aserciones de no nulo. */
function only<T>(list: readonly T[], index = 0): T {
    const found = list[index];

    if (found === undefined) {
        throw new Error('Falta un elemento de la prueba.');
    }

    return found;
}

function pick(menu: MenuSection[], group: CatalogGroup, itemIndex: number, variantIndex: number, on = true): MenuSection[] {
    const item = group.items[itemIndex];
    const variant = item?.variants[variantIndex] ?? null;

    if (!item) {
        throw new Error('El producto de la prueba no existe.');
    }

    return toggleVariant(menu, group, item, variant, on);
}

describe('dishName', () => {
    it('es producto, marca y presentación', () => {
        expect(dishName('Manzana', 'Postobón', '400 ml')).toBe('Manzana Postobón 400 ml');
        expect(dishName('Mora', null, 'Jarra')).toBe('Mora Jarra');
        expect(dishName('Arroz', null, null)).toBe('Arroz');
    });

    it('no repite la marca si el producto ya la nombra, igual que el servidor', () => {
        expect(dishName('Cerveza Águila', 'Águila', 'Botella 330 ml')).toBe('Cerveza Águila Botella 330 ml');
        expect(dishName('Coca-Cola', 'coca-cola', '400 ml')).toBe('Coca-Cola 400 ml');
        expect(dishName('Arroz', '  ', ' ')).toBe('Arroz');
    });
});

describe('dishName y el contrato con el servidor', () => {
    it.each(contract.cases)('$case', ({ name, brand, label, expected }) => {
        expect(dishName(name, brand, label)).toBe(expected);
    });
});

describe('parsePrice y formatPesos', () => {
    it('entiende lo que escribe la gente', () => {
        expect(parsePrice('3500')).toBe(3500);
        expect(parsePrice('$ 3.500')).toBe(3500);
        expect(parsePrice('3,500')).toBe(3500);
        expect(parsePrice('0')).toBe(0);
    });

    it('lo que no es un número es null', () => {
        expect(parsePrice('')).toBeNull();
        expect(parsePrice('mucho')).toBeNull();
        expect(parsePrice('12345678901')).toBeNull();
    });

    it('pone puntos de miles sin depender de Intl', () => {
        expect(formatPesos(3500)).toBe('$3.500');
        expect(formatPesos(950)).toBe('$950');
        expect(formatPesos(1234567)).toBe('$1.234.567');
    });
});

describe('marcar presentaciones', () => {
    it('crea la sección del grupo con el plato, sin precio y con la presentación como procedencia', () => {
        const menu = pick([], SODAS, 0, 0);

        expect(menu).toEqual([
            { name_es: 'Bebidas', name_en: 'Drinks', dishes: [{ name_es: 'Manzana Postobón 400 ml', name_en: null, price: null, is_alcohol: false, catalog_variant_id: 100 }] },
        ]);
    });

    it('agrega a la sección que ya existe, incluso si el dueño la nombró con otras mayúsculas', () => {
        const base: MenuSection[] = [{ name_es: ' bebidas ', name_en: null, dishes: [{ name_es: 'Limonada', name_en: null, price: 3000, is_alcohol: false, catalog_variant_id: null }] }];
        const menu = pick(base, SODAS, 1, 0);

        expect(menu).toHaveLength(1);
        expect(menu[0]?.dishes.map((dish) => dish.name_es)).toEqual(['Limonada', 'Colombiana Postobón 400 ml']);
    });

    it('marcar dos veces la misma no la duplica', () => {
        const once = pick([], SODAS, 0, 0);

        expect(pick(once, SODAS, 0, 0)[0]?.dishes).toHaveLength(1);
    });

    it('desmarcar quita el plato, y la sección si queda vacía; lo demás no se toca', () => {
        const both = pick(pick([], SODAS, 0, 0), SODAS, 0, 1);

        expect(pick(both, SODAS, 0, 0, false)[0]?.dishes.map((dish) => dish.catalog_variant_id)).toEqual([101]);
        expect(pick(pick(both, SODAS, 0, 0, false), SODAS, 0, 1, false)).toEqual([]);
    });

    it('una bebida alcohólica sale marcada, por su grupo', () => {
        expect(pick([], BEERS, 0, 0)[0]?.dishes[0]).toMatchObject({ name_es: 'Cerveza Águila Botella 330 ml', is_alcohol: true });
    });

    it('un producto sin presentaciones se marca por su nombre y lleva su inglés del catálogo', () => {
        const menu = pick([], EXTRAS, 0, 0);

        expect(menu[0]?.dishes[0]).toEqual({ name_es: 'Arroz', name_en: 'Rice', price: null, is_alcohol: false, catalog_variant_id: null });
        expect(isSelected(menu, EXTRAS, only(EXTRAS.items), null)).toBe(true);
        expect(pick(menu, EXTRAS, 0, 0, false)).toEqual([]);
    });

    it('sabe qué está marcado', () => {
        const menu = pick([], SODAS, 0, 1);
        const apple = only(SODAS.items);

        expect(isSelected(menu, SODAS, apple, only(apple.variants, 1))).toBe(true);
        expect(isSelected(menu, SODAS, apple, only(apple.variants, 0))).toBe(false);
    });
});

describe('precios', () => {
    const menu = pick(pick(pick([], SODAS, 0, 0), SODAS, 1, 0), SODAS, 0, 1);

    it('el precio de todas las de un tamaño, de una vez', () => {
        const priced = setLabelPrice(menu, SODAS, '400 ml', 3500);
        const prices = Object.fromEntries((priced[0]?.dishes ?? []).map((dish) => [dish.name_es, dish.price]));

        expect(prices).toEqual({ 'Manzana Postobón 400 ml': 3500, 'Colombiana Postobón 400 ml': 3500, 'Manzana Postobón 1,5 L': null });
    });

    it('luego se ajusta una fila sin tocar las demás', () => {
        const priced = setLabelPrice(menu, SODAS, '400 ml', 3500);
        const target = priced[0]?.dishes[1];

        if (!target) {
            throw new Error('Falta el plato de la prueba.');
        }

        const adjusted = setDishPrice(priced, target, 4000);

        expect(adjusted[0]?.dishes.map((dish) => dish.price)).toEqual([3500, 4000, null]);
    });

    it('no toca los platos que el dueño tecleó ni los de otro grupo', () => {
        const mixed: MenuSection[] = [...menu, { name_es: 'Almuerzos', name_en: null, dishes: [{ name_es: 'Bandeja', name_en: null, price: 22000, is_alcohol: false, catalog_variant_id: null }] }];
        const priced = setLabelPrice(mixed, SODAS, '400 ml', 1);

        expect(priced[1]?.dishes[0]?.price).toBe(22000);
        expect(setLabelPrice(pick(menu, BEERS, 0, 0), BEERS, 'Botella 330 ml', 4500)[1]?.dishes[0]?.price).toBe(4500);
        expect(setLabelPrice(pick(menu, BEERS, 0, 0), BEERS, 'Botella 330 ml', 4500)[0]?.dishes.every((dish) => dish.price === null)).toBe(true);
    });

    it('quitar un plato lo saca y, si la sección queda vacía, también', () => {
        const target = menu[0]?.dishes[0];

        if (!target) {
            throw new Error('Falta el plato de la prueba.');
        }

        expect(removeDish(menu, target)[0]?.dishes).toHaveLength(2);
        expect(removeDish([{ name_es: 'A', name_en: null, dishes: [target] }], target)).toEqual([]);
    });
});

describe('consultas', () => {
    it('las marcas de un grupo, sin repetirse y en orden', () => {
        expect(brandsOf(SODAS)).toEqual(['Postobón', 'Coca-Cola']);
        expect(brandsOf(EXTRAS)).toEqual([null]);
    });

    it('la presentación de un plato del grupo, o undefined si no es suyo', () => {
        const menu = pick(pick([], SODAS, 0, 0), BEERS, 0, 0);
        const soda = menu[0]?.dishes[0];
        const beer = menu[1]?.dishes[0];

        expect(soda && labelOf(SODAS, soda)).toBe('400 ml');
        expect(beer && labelOf(SODAS, beer)).toBeUndefined();
        expect(dishesOfGroup(menu, BEERS).map((entry) => entry.label)).toEqual(['Botella 330 ml']);
    });

    it('los nombres se comparan sin mayúsculas ni espacios de más', () => {
        expect(normalizedName('  Coca-Cola   400 ML ')).toBe('coca-cola 400 ml');
        expect(CATALOG.groups).toHaveLength(3);
    });
});

describe('renameDish', () => {
    const fromCatalog = { name_es: 'Manzana Postobón 400 ml', name_en: 'Apple Postobón 400 ml', price: 3500, is_alcohol: false, catalog_variant_id: 100 };

    it('un plato de catálogo que se renombra deja de serlo y pierde el inglés de la presentación', () => {
        const renamed = renameDish(fromCatalog, 'Manzana grande');

        expect(renamed).toEqual({ name_es: 'Manzana grande', name_en: null, price: 3500, is_alcohol: false, catalog_variant_id: null });
    });

    it('un plato propio solo cambia de nombre', () => {
        const own = { name_es: 'Sopa', name_en: null, price: 9000, is_alcohol: false, catalog_variant_id: null };

        expect(renameDish(own, 'Sopa del día')).toEqual({ ...own, name_es: 'Sopa del día' });
    });
});
