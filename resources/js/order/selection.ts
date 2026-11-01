import type { MenuDish, MenuOptionGroup } from '@/restaurants/profile';

import { blockingIngredient, ingredientEffects, isOptionOut } from './ingredients';

/**
 * Armar un plato del pedido (#14, ADR 0023): qué se eligió en cada grupo de
 * opciones, si alcanza para agregarlo, cuánto cuesta y cómo queda el ítem
 * que recibe el pedido. Funciones puras, sin Vue ni reloj: el selector
 * (DishPicker.vue) las usa y las pruebas las fijan sin montar nada.
 *
 * Los precios son pesos enteros, como los manda el servidor: sumar y
 * multiplicar enteros no redondea.
 *
 * Con `today` (el día de Colombia que calcula el menú), cuentan los
 * ingredientes agotados hoy (#112, ADR 0033, ver ingredients.ts): una
 * adición agotada no se elige ni cobra, un «Quitar» de algo que no hay queda
 * fijo, y un reemplazo aceptado suma su recargo. Sin `today`, el plato se
 * arma como siempre.
 */

/** Largo máximo de la nota libre («sin hielo, por favor»). */
export const NOTE_MAX_LENGTH = 140;

/** Cuántas unidades de un plato se agregan de una vez. */
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 20;

/** Lo elegido para un plato: por cada grupo, los índices de sus opciones, en orden. */
export interface DishSelection {
    chosen: number[][];
    note: string;
    quantity: number;
    /** Los ingredientes agotados (su posición en `dish.ingredients`) cuyo reemplazo se rechazó: van sin nada. */
    declined?: number[];
}

/** Por qué un grupo todavía no deja agregar el plato. */
export type GroupProblem =
    /** Faltan opciones por elegir (la proteína). */
    | { kind: 'missing'; min: number }
    /** Se eligieron más de las que deja. */
    | { kind: 'too_many'; max: number }
    /** Pide más opciones de las que hoy hay: el plato no se puede pedir. */
    | { kind: 'unavailable' };

/** Una opción elegida, tal como queda en el pedido. */
export interface ChosenOption {
    group: string;
    name: string;
    /** Recargo por unidad, en pesos. */
    price: number;
}

/** Un reemplazo aceptado: «Pepino en lugar de Tomate». */
export interface Swap {
    /** El reemplazo. */
    name: string;
    /** El ingrediente que hoy no hay. */
    instead: string;
    /** Recargo por unidad, en pesos. */
    price: number;
}

/**
 * Un plato listo para el pedido. Es una copia de lo que se vio (nombres y
 * precios), no una referencia al menú: el mensaje de WhatsApp (#15) escribe
 * nombres, y el id de la base no viaja al navegador (ADR 0018).
 */
export interface OrderItem {
    dish: string;
    /** Precio del plato más sus adiciones, por unidad. */
    unitPrice: number;
    quantity: number;
    choices: ChosenOption[];
    /** Ingredientes que se quitan («sin cebolla»). */
    removed: string[];
    /** Lo que hoy no hay y va sin reemplazo («sin Tomate (no hay hoy)»); solo si hay algo. */
    missing?: string[];
    /** Reemplazos aceptados; solo si hay alguno. */
    swaps?: Swap[];
    note: string | null;
}

/** Nada elegido, una unidad y sin nota. */
export function emptySelection(dish: MenuDish): DishSelection {
    return { chosen: dish.groups.map(() => []), note: '', quantity: MIN_QUANTITY, declined: [] };
}

/**
 * Si el grupo se elige con una sola opción (botones de radio): solo el
 * obligatorio de exactamente una. Uno opcional de tope 1 va con casilla,
 * porque un radio no se puede desmarcar.
 */
export function isSingleChoice(group: MenuOptionGroup): boolean {
    return group.kind === 'choice' && group.min === 1 && group.max === 1;
}

/** «Agotado hoy» vale hasta su fecha, incluida (`today` es `YYYY-MM-DD` de Colombia). */
export function isSoldOut(dish: MenuDish, today: string): boolean {
    return dish.sold_out_until !== null && dish.sold_out_until >= today;
}

/** Cuántas opciones del grupo se pueden elegir hoy: sin las adiciones agotadas. */
export function availableOptions(dish: MenuDish, group: MenuOptionGroup, today?: string): number {
    if (today === undefined || group.kind === 'removal') {
        return group.options.length;
    }

    return group.options.filter((option) => !isOptionOut(dish, option, today)).length;
}

/**
 * Si la opción hoy no se puede tocar: una adición que es un ingrediente
 * agotado (no se elige) o un «Quitar» de algo que no hay (queda marcado).
 */
export function isOptionLocked(dish: MenuDish, groupIndex: number, optionIndex: number, today?: string): boolean {
    const option = dish.groups[groupIndex]?.options[optionIndex];

    return today !== undefined && option !== undefined && isOptionOut(dish, option, today);
}

/**
 * Si la opción se ve marcada: lo elegido, sin las adiciones agotadas hoy y,
 * en un grupo de quitar, también lo que hoy no hay.
 */
export function isOptionChosen(dish: MenuDish, selection: DishSelection, groupIndex: number, optionIndex: number, today?: string): boolean {
    const group = dish.groups[groupIndex];

    if (group === undefined) {
        return false;
    }

    if (isOptionLocked(dish, groupIndex, optionIndex, today)) {
        return group.kind === 'removal';
    }

    return selection.chosen[groupIndex]?.includes(optionIndex) ?? false;
}

/** Lo marcado en un grupo que cuenta hoy: sin las opciones fijas por un ingrediente agotado. */
function effectiveChosen(dish: MenuDish, selection: DishSelection, groupIndex: number, today?: string): number[] {
    return (selection.chosen[groupIndex] ?? []).filter((optionIndex) => !isOptionLocked(dish, groupIndex, optionIndex, today));
}

/**
 * Si el plato se puede agregar hoy: no está agotado, no le falta un
 * ingrediente esencial y cada grupo tiene opciones suficientes.
 */
export function isOrderable(dish: MenuDish, today: string): boolean {
    return (
        !isSoldOut(dish, today) &&
        blockingIngredient(dish, today) === null &&
        dish.groups.every((group) => group.min <= availableOptions(dish, group, today))
    );
}

/** Por qué el plato hoy no se puede agregar (EVA-004). */
export type UnavailableReason = { reason: 'sold_out' } | { reason: 'ingredient'; name: string } | { reason: 'options' };

/**
 * Por qué el plato hoy no se puede agregar, o `null` si se puede: está
 * agotado, le falta un ingrediente esencial (cuál) o un grupo obligatorio se
 * quedó sin opciones. Es lo mismo que isOrderable, con el motivo.
 */
export function unavailableReason(dish: MenuDish, today: string): UnavailableReason | null {
    if (isSoldOut(dish, today)) {
        return { reason: 'sold_out' };
    }

    const missing = blockingIngredient(dish, today);

    if (missing !== null) {
        return { reason: 'ingredient', name: missing };
    }

    return isOrderable(dish, today) ? null : { reason: 'options' };
}

/** Aceptar (true) o rechazar el reemplazo del ingrediente `index`. */
export function setSubstitute(selection: DishSelection, index: number, accept: boolean): DishSelection {
    const declined = (selection.declined ?? []).filter((other) => other !== index);

    return { ...selection, declined: accept ? declined : [...declined, index].sort((a, b) => a - b) };
}

/** Si el reemplazo del ingrediente `index` está aceptado: lo está hasta que se rechace. */
export function acceptsSubstitute(selection: DishSelection, index: number): boolean {
    return !(selection.declined ?? []).includes(index);
}

/**
 * Tocar una opción. En un grupo de una sola opción, la elige (y suelta la
 * anterior); en los demás, la pone o la saca, sin pasar del tope: si el
 * grupo está lleno, tocar otra no cambia nada.
 */
export function toggleOption(selection: DishSelection, group: MenuOptionGroup, groupIndex: number, optionIndex: number): DishSelection {
    const current = selection.chosen[groupIndex] ?? [];
    let next: number[];

    if (isSingleChoice(group)) {
        next = [optionIndex];
    } else if (current.includes(optionIndex)) {
        next = current.filter((index) => index !== optionIndex);
    } else if (current.length >= group.max) {
        return selection;
    } else {
        next = [...current, optionIndex].sort((a, b) => a - b);
    }

    return { ...selection, chosen: selection.chosen.map((indexes, index) => (index === groupIndex ? next : indexes)) };
}

/** Lo que le falta (o le sobra) a un grupo; `null` si está bien. `available`: las que hoy se pueden elegir. */
export function groupProblem(group: MenuOptionGroup, chosen: readonly number[], available: number = group.options.length): GroupProblem | null {
    if (group.min > available) {
        return { kind: 'unavailable' };
    }

    if (chosen.length < group.min) {
        return { kind: 'missing', min: group.min };
    }

    if (chosen.length > group.max) {
        return { kind: 'too_many', max: group.max };
    }

    return null;
}

/** El problema de cada grupo, en el orden del plato. */
export function selectionProblems(dish: MenuDish, selection: DishSelection, today?: string): (GroupProblem | null)[] {
    return dish.groups.map((group, index) => groupProblem(group, effectiveChosen(dish, selection, index, today), availableOptions(dish, group, today)));
}

/** Entre 1 y 20 unidades, enteras. */
export function clampQuantity(quantity: number): number {
    if (!Number.isFinite(quantity)) {
        return MIN_QUANTITY;
    }

    return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.trunc(quantity)));
}

/** La nota sin espacios de más, recortada al largo máximo. */
export function normalizeNote(note: string): string {
    return note.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX_LENGTH);
}

/** Las opciones elegidas que suman (quitar un ingrediente nunca cobra). */
function chosenOptions(dish: MenuDish, selection: DishSelection, today?: string): ChosenOption[] {
    return dish.groups.flatMap((group, groupIndex) =>
        group.kind === 'removal'
            ? []
            : effectiveChosen(dish, selection, groupIndex, today).flatMap((optionIndex) => {
                  const option = group.options[optionIndex];

                  return option === undefined ? [] : [{ group: group.name, name: option.name, price: option.price }];
              }),
    );
}

/** Lo que hoy no hay en el plato: los reemplazos aceptados y lo que va sin nada. */
function todaysChanges(dish: MenuDish, selection: DishSelection, today?: string): { missing: string[]; swaps: Swap[] } {
    const missing: string[] = [];
    const swaps: Swap[] = [];

    for (const effect of today === undefined ? [] : ingredientEffects(dish, today)) {
        if (effect.kind === 'substitute' && (effect.required || acceptsSubstitute(selection, effect.index))) {
            swaps.push({ name: effect.substitute, instead: effect.name, price: effect.price });
        } else if (effect.kind !== 'blocks') {
            missing.push(effect.name);
        }
    }

    return { missing, swaps };
}

/** El precio de una unidad: el plato más sus adiciones y los reemplazos aceptados. */
export function unitPrice(dish: MenuDish, selection: DishSelection, today?: string): number {
    const withOptions = chosenOptions(dish, selection, today).reduce((total, option) => total + option.price, dish.price);

    return todaysChanges(dish, selection, today).swaps.reduce((total, swap) => total + swap.price, withOptions);
}

/** El precio de la línea: una unidad por la cantidad. */
export function linePrice(dish: MenuDish, selection: DishSelection, today?: string): number {
    return unitPrice(dish, selection, today) * clampQuantity(selection.quantity);
}

/**
 * El ítem para el pedido, o `null` si todavía no se puede agregar: algún
 * grupo tiene un problema.
 */
export function toOrderItem(dish: MenuDish, selection: DishSelection, today?: string): OrderItem | null {
    if (today !== undefined && blockingIngredient(dish, today) !== null) {
        return null;
    }

    if (selectionProblems(dish, selection, today).some((problem) => problem !== null)) {
        return null;
    }

    // Un «Quitar» de algo que hoy no hay no se repite: ya va en `missing` o en `swaps`.
    const removed = dish.groups.flatMap((group, groupIndex) =>
        group.kind === 'removal' ? effectiveChosen(dish, selection, groupIndex, today).flatMap((index) => group.options[index]?.name ?? []) : [],
    );
    const note = normalizeNote(selection.note);
    const { missing, swaps } = todaysChanges(dish, selection, today);

    return {
        dish: dish.name,
        unitPrice: unitPrice(dish, selection, today),
        quantity: clampQuantity(selection.quantity),
        choices: chosenOptions(dish, selection, today),
        removed,
        ...(missing.length > 0 ? { missing } : {}),
        ...(swaps.length > 0 ? { swaps } : {}),
        note: note === '' ? null : note,
    };
}

/** Dos ítems son la misma línea si solo cambia la cantidad. */
export function sameLine(a: OrderItem, b: OrderItem): boolean {
    return (
        a.dish === b.dish &&
        a.unitPrice === b.unitPrice &&
        a.note === b.note &&
        a.removed.join('\u0000') === b.removed.join('\u0000') &&
        (a.missing ?? []).join('\u0000') === (b.missing ?? []).join('\u0000') &&
        JSON.stringify(a.swaps ?? []) === JSON.stringify(b.swaps ?? []) &&
        a.choices.length === b.choices.length &&
        a.choices.every((choice, index) => {
            const other = b.choices[index];

            return other !== undefined && choice.group === other.group && choice.name === other.name && choice.price === other.price;
        })
    );
}

/** Agregar un ítem: si ya hay una línea igual, suma la cantidad (sin pasar del tope). */
export function addItem(items: readonly OrderItem[], item: OrderItem): OrderItem[] {
    const index = items.findIndex((existing) => sameLine(existing, item));

    if (index === -1) {
        return [...items, item];
    }

    return items.map((existing, position) => (position === index ? { ...existing, quantity: clampQuantity(existing.quantity + item.quantity) } : existing));
}

/** El total estimado de los ítems, en pesos. */
export function itemsTotal(items: readonly OrderItem[]): number {
    return items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}

/** Cuántas unidades hay en total. */
export function itemsCount(items: readonly OrderItem[]): number {
    return items.reduce((total, item) => total + item.quantity, 0);
}
