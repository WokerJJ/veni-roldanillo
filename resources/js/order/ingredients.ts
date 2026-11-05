import type { MenuDish, MenuOption } from '@/restaurants/profile';

/**
 * Ingredientes agotados hoy (#112, ADR 0033): qué le pasa a un plato cuando
 * al restaurante se le acaba algo. Funciones puras y sin reloj, como
 * selection.ts: `today` es el día de Colombia (`YYYY-MM-DD`) que calcula el
 * menú, así que un aviso se va solo a la medianoche aunque la ficha siga
 * abierta.
 *
 * - Esencial agotado con un reemplazo que hoy hay: «Hoy con Y en lugar de X»;
 *   el plato sale con el reemplazo (suma el recargo), sin la opción de
 *   pedirlo sin nada (EVA-003).
 * - Esencial agotado sin reemplazo (o con el reemplazo también agotado): el
 *   plato no se puede pedir hoy («No disponible hoy · sin X»).
 * - No esencial, sin reemplazo (o con el reemplazo también agotado): «Hoy sin X».
 * - No esencial con reemplazo: «Hoy con Y en lugar de X»; la persona lo
 *   acepta (suma el recargo) o lo pide sin nada.
 * - Una adición que es un ingrediente agotado no se puede elegir.
 */

/**
 * Lo que un ingrediente agotado le hace hoy a un plato. Un reemplazo
 * `required` es el de un esencial: va sí o sí, no se puede pedir sin nada.
 */
export type IngredientEffect =
    | { kind: 'blocks'; index: number; name: string }
    | { kind: 'without'; index: number; name: string }
    | { kind: 'substitute'; index: number; name: string; substitute: string; price: number; required: boolean };

/** «Agotado hoy» vale hasta su fecha, incluida. */
function outOn(until: string | null, today: string): boolean {
    return until !== null && until >= today;
}

/** Si el ingrediente `index` del plato está agotado hoy. */
export function isIngredientOut(dish: MenuDish, index: number, today: string): boolean {
    const ingredient = dish.ingredients?.[index];

    return ingredient !== undefined && outOn(ingredient.sold_out_until, today);
}

/** Si la opción es un ingrediente agotado hoy. */
export function isOptionOut(dish: MenuDish, option: MenuOption, today: string): boolean {
    return option.ingredient !== undefined && option.ingredient !== null && isIngredientOut(dish, option.ingredient, today);
}

/**
 * Los ingredientes que el plato lleva y hoy no hay, con su efecto, en el
 * orden de la ficha (ninguno sin `today`). Los que solo nombra una adición no cambian el plato:
 * esa adición, simplemente, no se puede elegir.
 */
export function ingredientEffects(dish: MenuDish, today: string | undefined): IngredientEffect[] {
    return (dish.ingredients ?? []).flatMap((ingredient, index): IngredientEffect[] => {
        if (today === undefined || !ingredient.in_dish || !outOn(ingredient.sold_out_until, today)) {
            return [];
        }

        const substitute = ingredient.substitute;

        if (substitute !== null && !outOn(substitute.sold_out_until, today)) {
            return [{ kind: 'substitute', index, name: ingredient.name, substitute: substitute.name, price: substitute.price, required: ingredient.essential }];
        }

        return [{ kind: ingredient.essential ? 'blocks' : 'without', index, name: ingredient.name }];
    });
}

/** El primer ingrediente esencial que hoy no hay ni tiene reemplazo, o null: con uno, el plato no se puede pedir. */
export function blockingIngredient(dish: MenuDish, today: string): string | null {
    return ingredientEffects(dish, today).find((effect) => effect.kind === 'blocks')?.name ?? null;
}

/**
 * Si la opción `optionIndex` del grupo de quitar es un ingrediente que hoy
 * va con reemplazo (EVA-005): esa decisión la toma el grupo del reemplazo,
 * así que el selector no muestra el «Quitar X».
 */
export function isOptionSubstituted(dish: MenuDish, groupIndex: number, optionIndex: number, today: string | undefined): boolean {
    const group = dish.groups[groupIndex];
    const ingredient = group?.kind === 'removal' ? group.options[optionIndex]?.ingredient : undefined;

    return (
        ingredient !== undefined &&
        ingredient !== null &&
        ingredientEffects(dish, today).some((effect) => effect.kind === 'substitute' && effect.index === ingredient)
    );
}

/**
 * Un chip de la carta (#115, ADR 0036): un ingrediente que lleva el plato y
 * cómo está hoy. `missing`, que hoy no hay (sin reemplazo, o con el
 * reemplazo también agotado); `swap`, que va con su reemplazo y el recargo
 * por unidad (0 si no suma). `icon` es el nombre en español de lo que el
 * chip dibuja (el reemplazo, en un `swap`): el ícono no cambia con el idioma
 * (BUG-025).
 */
export type IngredientChip =
    | { kind: 'present'; name: string; icon: string }
    | { kind: 'missing'; name: string; icon: string }
    | { kind: 'swap'; name: string; substitute: string; price: number; icon: string };

/**
 * Los chips del plato, en el orden del dueño, con el mismo criterio que
 * `ingredientEffects` (sin `today`, todos como si hubiera). Vacío con una
 * ficha guardada antes, que no trae `contains`.
 */
export function ingredientChips(dish: MenuDish, today: string | undefined): IngredientChip[] {
    const effects = ingredientEffects(dish, today);

    return (dish.contains ?? []).map(({ name, name_es, ingredient }): IngredientChip => {
        const effect = ingredient === null ? undefined : effects.find((candidate) => candidate.index === ingredient);
        const icon = name_es ?? name;

        if (effect === undefined) {
            return { kind: 'present', name, icon };
        }

        if (effect.kind !== 'substitute') {
            return { kind: 'missing', name, icon };
        }

        const substitute = dish.ingredients?.[effect.index]?.substitute;

        return { kind: 'swap', name, substitute: effect.substitute, price: effect.price, icon: substitute?.name_es ?? effect.substitute };
    });
}

/** Si el ingrediente `index` de la lista de agotados ya se ve como chip: su aviso no se repite en texto aparte. */
export function isShownAsChip(dish: MenuDish, index: number): boolean {
    return (dish.contains ?? []).some((content) => content.ingredient === index);
}
