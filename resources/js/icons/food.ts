import type { IngredientChip } from '@/order/ingredients';

import type { ColombiaIconName, IconName, VeniIconName } from './icons';
import { veniIcons } from './veni';

/**
 * Qué ícono lleva cada cosa de comer (ADR 0036): un ingrediente, un plato o
 * una categoría. Todo por nombre, sin columnas en la base: el ícono de un
 * ingrediente es el archivo de resources/icons/veni con su nombre
 * normalizado (sin tildes, en minúsculas y con guiones), así que agregar
 * `tomate.svg` le pone ícono a todo «Tomate» de todos los restaurantes sin
 * que nadie toque el panel. Lo que no tiene ícono lleva el genérico.
 */

/** El tazón de respaldo: lo que no tiene ícono propio. */
export const GENERIC_FOOD_ICON: VeniIconName = 'veni/generico';

/** Los propios que hay: el nombre de cada archivo de resources/icons/veni. */
const OWN: ReadonlySet<string> = new Set(Object.keys(veniIcons).map((file) => file.slice('./veni/'.length, -'.svg'.length)));

/**
 * «Plátano maduro (prueba)» → «platano-maduro»: sin tildes (la ñ queda n),
 * en minúsculas, sin lo que va entre paréntesis y con guiones entre palabras.
 * Es la forma de los nombres de archivo de los íconos.
 */
export function normalizeFoodName(text: string): string {
    return text
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** La palabra y su singular probable: «fríjoles» → frijol, «tomates» → tomate, «nueces» → nuez. */
function forms(word: string): string[] {
    const found = [word];

    if (word.length > 3 && word.endsWith('s')) {
        found.push(word.slice(0, -1));

        if (word.endsWith('es')) {
            found.push(word.slice(0, -2));
        }

        if (word.endsWith('ces')) {
            found.push(`${word.slice(0, -3)}z`);
        }
    }

    return found;
}

/**
 * El ícono propio para un ingrediente, entre los que hay (`available`, por
 * defecto los de la carpeta): primero el nombre entero («platano-maduro»),
 * después la primera palabra («Queso costeño» → queso), cada uno también en
 * singular. Sin ninguno, el genérico.
 */
export function ingredientIcon(name: string, available: ReadonlySet<string> = OWN): IconName {
    const slug = normalizeFoodName(name);
    const first = slug.split('-')[0] ?? '';
    const match = [...forms(slug), ...forms(first)].find((candidate) => candidate !== '' && available.has(candidate));

    return match === undefined ? GENERIC_FOOD_ICON : `veni/${match}`;
}

/**
 * El ícono de un chip de la carta (BUG-026): el de su ingrediente o, si va
 * con reemplazo, el del reemplazo; siempre por `icon`, el nombre en español,
 * así que no cambia con el idioma de la ficha (BUG-025).
 */
export function chipIconName(chip: IngredientChip, available: ReadonlySet<string> = OWN): IconName {
    return ingredientIcon(chip.icon, available);
}

/**
 * Platos típicos de colombia-icons, por las palabras de su nombre: el primero
 * que coincide gana, así que los más específicos van antes («arepa de
 * choclo» antes que «arepa»). La primera palabra clave tiene que ser la
 * primera del nombre (en singular o en plural): «Sancocho de gallina» es un
 * sancocho, pero «Vino tinto» no es un tinto ni «Jugo con arepa» una arepa
 * (BUG-025). Lo que no empieza por el plato típico lleva un propio o el
 * genérico, que es menos malo que el ícono de otra cosa.
 */
const DISHES: readonly (readonly [readonly string[], ColombiaIconName])[] = [
    [['bandeja'], 'bandeja-paisa'],
    [['arepa', 'choclo'], 'arepa-de-choclo'],
    [['arepa', 'huevo'], 'arepa-de-huevo'],
    [['arepa', 'boyacense'], 'arepa-boyacense'],
    [['arepa'], 'arepa'],
    [['empanada'], 'empanada'],
    [['patacon'], 'patacon'],
    [['pescado'], 'pescado-frito'],
    [['mojarra'], 'pescado-frito'],
    [['tilapia'], 'pescado-frito'],
    [['chicharron'], 'chicharron'],
    [['ajiaco'], 'ajiaco'],
    [['sancocho'], 'sancocho'],
    [['tinto'], 'taza-de-tinto'],
    [['cafe'], 'taza-de-tinto'],
    [['aguardiente'], 'aguardiente'],
];

/**
 * El ícono de un plato: el típico de colombia-icons si su nombre empieza por
 * él («Sancocho de gallina», «Empanadas vallunas»), un propio con el nombre
 * entero del plato si lo hay, o el genérico. `name` es el nombre en español
 * (`name_es` de la ficha, BUG-025): en inglés «Hen soup» no nombra nada.
 */
export function dishIcon(name: string, available: ReadonlySet<string> = OWN): IconName {
    const slug = normalizeFoodName(name);
    const words = new Set(slug.split('-').flatMap(forms));
    const first = new Set(forms(slug.split('-')[0] ?? ''));
    const typical = DISHES.find(([keywords]) => first.has(keywords[0] ?? '') && keywords.every((keyword) => words.has(keyword)));

    if (typical !== undefined) {
        return typical[1];
    }

    return available.has(slug) ? `veni/${slug}` : GENERIC_FOOD_ICON;
}

/** Las categorías de comida (CategorySeeder, lo comprueba food.test.ts) y su ícono. */
export const CATEGORIES: Readonly<Record<string, IconName>> = {
    'comida-tipica': 'bandeja-paisa',
    'comidas-rapidas': 'empanada',
    asados: 'chicharron',
    'panaderia-cafeteria': 'taza-de-tinto',
    'pescados-mariscos': 'pescado-frito',
    'heladeria-postres': GENERIC_FOOD_ICON,
};

/** El ícono de una categoría; una que todavía no tiene, el genérico (como un ingrediente). */
export function categoryIcon(slug: string): IconName {
    return CATEGORIES[slug] ?? GENERIC_FOOD_ICON;
}
