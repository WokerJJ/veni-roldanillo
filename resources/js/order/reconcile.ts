import { ingredientEffects, isOptionOut } from '@/order/ingredients';
import { availableOptions, isOrderable, type OrderItem } from '@/order/selection';
import type { MenuDish } from '@/restaurants/profile';

/*
| El carrito guarda una copia de lo que se vio al agregar cada plato (nombres
| y precios, ADR 0024) y dura un día. Entre tanto la carta puede cambiar: el
| plato se agota, sube de precio, o lo que anoche no había hoy sí hay. Antes
| de enviar, cada línea se vuelve a mirar contra la carta de hoy.
|
| El pedido no guarda ids (ADR 0018): el plato y sus opciones se buscan por
| nombre. El plato se reconoce también por su nombre en español, pero los
| grupos, las opciones y los ingredientes solo viajan en el idioma de la
| ficha: si se cambia de idioma con platos en el pedido, una línea con
| opciones o avisos sale como `changed` (y una agregada en inglés y vista en
| español, como `gone`). Se quita y se vuelve a agregar, que es también el
| arreglo de los demás casos.
*/

/** Por qué una línea ya no se puede enviar como está. */
export type LineProblem =
    /** El plato ya no está en la carta. */
    | 'gone'
    /** Está, pero hoy no se puede pedir (agotado, o le falta un esencial). */
    | 'unavailable'
    /** Cambió su precio, una de sus opciones, o lo que hoy no hay. */
    | 'changed';

/**
 * Si lo elegido sigue valiendo: cada opción está en la carta, al mismo precio
 * y disponible hoy; cada grupo recibe entre su mínimo y su máximo (un grupo
 * obligatorio agregado después deja la línea vieja); y lo que se quita se
 * puede quitar. Los nombres pueden repetirse (dos grupos «Adiciones»): basta
 * con que una de las opciones de ese nombre cuadre, y a un grupo de nombre
 * repetido no se le cuentan las elegidas.
 */
function choicesHold(item: OrderItem, dish: MenuDish, today: string): boolean {
    const groups = dish.groups.filter((group) => group.kind === 'choice');
    const listed = item.choices.every((choice) =>
        groups.some(
            (group) =>
                group.name === choice.group &&
                group.options.some((option) => option.name === choice.name && option.price === choice.price && !isOptionOut(dish, option, today)),
        ),
    );
    const counted = groups.every((group) => {
        if (groups.filter((other) => other.name === group.name).length > 1) {
            return true;
        }

        const chosen = item.choices.filter((choice) => choice.group === group.name).length;

        return chosen <= group.max && chosen >= Math.min(group.min, availableOptions(dish, group, today));
    });
    const removable = item.removed.every((name) =>
        dish.groups.some((group) => group.kind === 'removal' && group.options.some((option) => option.name === name)),
    );

    return listed && counted && removable;
}

/** Si lo que la línea dice de los ingredientes agotados («no hay hoy», los reemplazos) es lo de hoy, ni más ni menos. */
function ingredientsHold(item: OrderItem, dish: MenuDish, today: string): boolean {
    const effects = ingredientEffects(dish, today);
    const missing = item.missing ?? [];
    const swaps = item.swaps ?? [];

    const missingHolds = missing.every((name) =>
        effects.some((effect) => effect.name === name && (effect.kind === 'without' || (effect.kind === 'substitute' && !effect.required))),
    );
    const swapsHold = swaps.every((swap) =>
        effects.some((effect) => effect.kind === 'substitute' && effect.name === swap.instead && effect.substitute === swap.name && effect.price === swap.price),
    );
    const allNoted = effects.every((effect) => missing.includes(effect.name) || swaps.some((swap) => swap.instead === effect.name));

    return missingHolds && swapsHold && allNoted;
}

/** Si la línea cuadra con este plato tal como está hoy en la carta. */
function matches(item: OrderItem, dish: MenuDish, today: string): boolean {
    const extras = item.choices.reduce((sum, choice) => sum + choice.price, 0) + (item.swaps ?? []).reduce((sum, swap) => sum + swap.price, 0);

    return item.unitPrice - extras === dish.price && choicesHold(item, dish, today) && ingredientsHold(item, dish, today);
}

/**
 * El problema de una línea frente a la carta de hoy, o null si se puede enviar
 * como está. Dos platos pueden llamarse igual (una «Limonada» en cada
 * sección): la línea vale si cuadra con alguno de los que hoy se pueden pedir.
 */
export function lineProblem(item: OrderItem, dishes: readonly MenuDish[], today: string): LineProblem | null {
    const candidates = dishes.filter((dish) => dish.name === item.dish || dish.name_es === item.dish);

    if (candidates.length === 0) {
        return 'gone';
    }

    const orderable = candidates.filter((dish) => isOrderable(dish, today));

    if (orderable.length === 0) {
        return 'unavailable';
    }

    return orderable.some((dish) => matches(item, dish, today)) ? null : 'changed';
}
