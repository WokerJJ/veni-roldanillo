/*
| El catálogo en el teléfono y cómo arma la carta (ADR 0049). Son funciones
| puras sobre la carta del borrador: marcar una presentación crea su plato en
| la sección de su grupo, desmarcarla lo quita, y el precio se pone plato por
| plato o de una vez para todas las de un tamaño («todas las de 400 ml: $3.500»).
|
| Solo texto: el catálogo trae nombres de productos, nunca logos ni imágenes.
*/

import type { MenuDish, MenuSection } from './draft';

export interface CatalogVariant {
    id: number;
    label: string;
}

export interface CatalogItem {
    id: number;
    brand: string | null;
    name_es: string;
    name_en: string | null;
    is_alcohol: boolean;
    variants: CatalogVariant[];
}

export interface CatalogGroup {
    id: number;
    slug: string;
    name_es: string;
    name_en: string | null;
    section_name_es: string;
    section_name_en: string | null;
    is_alcohol: boolean;
    items: CatalogItem[];
}

export interface Catalog {
    /** Huella de su contenido: se reemplaza lo guardado solo cuando cambia. */
    version: string;
    groups: CatalogGroup[];
}

export const EMPTY_CATALOG: Catalog = { version: '', groups: [] };

/**
 * El nombre del plato: producto, marca y presentación («Manzana Postobón
 * 400 ml»). La marca no se repite si el producto ya la nombra. Es la misma
 * regla de `CatalogItem::dishName` en el servidor.
 */
export function dishName(name: string, brand: string | null, label: string | null): string {
    const cleanBrand = brand === null || brand.trim() === '' || name.toLowerCase().includes(brand.trim().toLowerCase()) ? null : brand.trim();

    return [name, cleanBrand, label]
        .filter((part): part is string => part !== null && part.trim() !== '')
        .join(' ')
        .trim();
}

/** Lo mismo que `normalized` del servidor: sin mayúsculas ni espacios de más. */
export function normalizedName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Las marcas de un grupo, en el orden en que aparecen; null es «sin marca». */
export function brandsOf(group: CatalogGroup): (string | null)[] {
    const seen: (string | null)[] = [];

    for (const item of group.items) {
        if (!seen.includes(item.brand)) {
            seen.push(item.brand);
        }
    }

    return seen;
}

/**
 * La presentación de un plato de la carta si viene de este grupo del catálogo:
 * por su presentación, o por su nombre si el producto no tiene presentaciones
 * («Arroz», que da ''). undefined si el plato no es del grupo.
 */
export function labelOf(group: CatalogGroup, dish: MenuDish): string | undefined {
    if (dish.catalog_variant_id !== null) {
        for (const item of group.items) {
            const variant = item.variants.find((candidate) => candidate.id === dish.catalog_variant_id);

            if (variant) {
                return variant.label;
            }
        }

        return undefined;
    }

    const name = normalizedName(dish.name_es);

    return group.items.some((item) => item.variants.length === 0 && normalizedName(dishName(item.name_es, item.brand, null)) === name) ? '' : undefined;
}

/** Los platos de la carta que vienen de un grupo del catálogo, con su presentación. */
export function dishesOfGroup(menu: readonly MenuSection[], group: CatalogGroup): { dish: MenuDish; label: string }[] {
    return menu.flatMap((section) =>
        section.dishes.flatMap((dish) => {
            const label = labelOf(group, dish);

            return label === undefined ? [] : [{ dish, label }];
        }),
    );
}

/** Si una presentación (o un producto sin ellas) ya está en la carta. */
export function isSelected(menu: readonly MenuSection[], group: CatalogGroup, item: CatalogItem, variant: CatalogVariant | null): boolean {
    const name = normalizedName(dishName(item.name_es, item.brand, variant?.label ?? null));

    return menu.some((section) =>
        section.dishes.some((dish) => (variant === null ? dish.catalog_variant_id === null && normalizedName(dish.name_es) === name : dish.catalog_variant_id === variant.id)),
    );
}

function sectionIndex(menu: readonly MenuSection[], group: CatalogGroup): number {
    return menu.findIndex((section) => normalizedName(section.name_es) === normalizedName(group.section_name_es));
}

/**
 * Marca o desmarca una presentación (o un producto sin presentaciones, con
 * `variant` null). Marcarla agrega su plato, sin precio todavía, a la sección de su
 * grupo, que se crea si no está; desmarcarla lo quita y, si la sección queda vacía,
 * también. Un plato que ya está (por su presentación o su nombre) no se duplica.
 */
export function toggleVariant(menu: readonly MenuSection[], group: CatalogGroup, item: CatalogItem, variant: CatalogVariant | null, on: boolean): MenuSection[] {
    const name = dishName(item.name_es, item.brand, variant?.label ?? null);
    const same = (dish: MenuDish): boolean => (variant === null ? dish.catalog_variant_id === null && normalizedName(dish.name_es) === normalizedName(name) : dish.catalog_variant_id === variant.id);
    const next = menu.map((section) => ({ ...section, dishes: [...section.dishes] }));
    const index = sectionIndex(next, group);

    if (!on) {
        return next.map((section) => ({ ...section, dishes: section.dishes.filter((dish) => !same(dish)) })).filter((section, position) => section.dishes.length > 0 || position !== index);
    }

    // El inglés de un producto sin presentaciones sale del catálogo aquí; el de uno con presentaciones lo arma el servidor al aprobar.
    const english = variant === null && item.name_en ? dishName(item.name_en, item.brand, null) : null;
    const dish: MenuDish = { name_es: name, name_en: english, price: null, is_alcohol: item.is_alcohol || group.is_alcohol, catalog_variant_id: variant?.id ?? null };

    if (index === -1) {
        return [...next, { name_es: group.section_name_es, name_en: group.section_name_en, dishes: [dish] }];
    }

    const section = next[index];

    if (section && !section.dishes.some((existing) => same(existing) || normalizedName(existing.name_es) === normalizedName(name))) {
        section.dishes.push(dish);
    }

    return next;
}

/** Quita un plato de la carta (el mismo objeto); una sección que queda vacía se va. */
export function removeDish(menu: readonly MenuSection[], target: MenuDish): MenuSection[] {
    return menu.map((section) => ({ ...section, dishes: section.dishes.filter((dish) => dish !== target) })).filter((section) => section.dishes.length > 0);
}

/** El precio de un plato del catálogo; `null` lo deja sin precio. */
export function setDishPrice(menu: readonly MenuSection[], target: MenuDish, price: number | null): MenuSection[] {
    return menu.map((section) => ({ ...section, dishes: section.dishes.map((dish) => (dish === target ? { ...dish, price } : dish)) }));
}

/**
 * Renombra un plato. Si venía de una presentación del catálogo deja de serlo
 * (`catalog_variant_id` null) y pierde su inglés: si no, el servidor le pondría
 * el inglés de la presentación original a un plato que ya es otro.
 */
export function renameDish(dish: MenuDish, name: string): MenuDish {
    return dish.catalog_variant_id === null ? { ...dish, name_es: name } : { ...dish, name_es: name, name_en: null, catalog_variant_id: null };
}

/** El mismo precio para todas las marcadas de un tamaño del grupo («todas las de 400 ml: $3.500»). */
export function setLabelPrice(menu: readonly MenuSection[], group: CatalogGroup, label: string, price: number | null): MenuSection[] {
    return menu.map((section) => ({
        ...section,
        dishes: section.dishes.map((dish) => (labelOf(group, dish) === label ? { ...dish, price } : dish)),
    }));
}

/** Un precio escrito por una persona («3.500», «$ 3500», «3,500»): pesos enteros, o null si no es un número. */
export function parsePrice(text: string): number | null {
    const digits = text.replace(/[^\d]/g, '');

    if (digits === '' || digits.length > 9) {
        return null;
    }

    return Number(digits);
}

/** Miles con punto, sin el signo: 3500 → «3.500» (lo que se ve en el campo de precio). */
export function formatThousands(price: number): string {
    return String(price).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Pesos con puntos de miles: 3500 → «$3.500», sin depender de los datos de Intl del teléfono. */
export function formatPesos(price: number): string {
    return `$${formatThousands(price)}`;
}
