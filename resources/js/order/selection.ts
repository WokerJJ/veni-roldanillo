import type { MenuDish, MenuOptionGroup } from '@/restaurants/profile';

/**
 * Armar un plato del pedido (#14, ADR 0023): qué se eligió en cada grupo de
 * opciones, si alcanza para agregarlo, cuánto cuesta y cómo queda el ítem
 * que recibe el pedido. Funciones puras, sin Vue ni reloj: el selector
 * (DishPicker.vue) las usa y las pruebas las fijan sin montar nada.
 *
 * Los precios son pesos enteros, como los manda el servidor: sumar y
 * multiplicar enteros no redondea.
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
    note: string | null;
}

/** Nada elegido, una unidad y sin nota. */
export function emptySelection(dish: MenuDish): DishSelection {
    return { chosen: dish.groups.map(() => []), note: '', quantity: MIN_QUANTITY };
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

/** Si el plato se puede agregar hoy: no está agotado y cada grupo tiene opciones suficientes. */
export function isOrderable(dish: MenuDish, today: string): boolean {
    return !isSoldOut(dish, today) && dish.groups.every((group) => group.min <= group.options.length);
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

/** Lo que le falta (o le sobra) a un grupo; `null` si está bien. */
export function groupProblem(group: MenuOptionGroup, chosen: readonly number[]): GroupProblem | null {
    if (group.min > group.options.length) {
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
export function selectionProblems(dish: MenuDish, selection: DishSelection): (GroupProblem | null)[] {
    return dish.groups.map((group, index) => groupProblem(group, selection.chosen[index] ?? []));
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
function chosenOptions(dish: MenuDish, selection: DishSelection): ChosenOption[] {
    return dish.groups.flatMap((group, groupIndex) =>
        group.kind === 'removal'
            ? []
            : (selection.chosen[groupIndex] ?? []).flatMap((optionIndex) => {
                  const option = group.options[optionIndex];

                  return option === undefined ? [] : [{ group: group.name, name: option.name, price: option.price }];
              }),
    );
}

/** El precio de una unidad: el plato más sus adiciones. */
export function unitPrice(dish: MenuDish, selection: DishSelection): number {
    return chosenOptions(dish, selection).reduce((total, option) => total + option.price, dish.price);
}

/** El precio de la línea: una unidad por la cantidad. */
export function linePrice(dish: MenuDish, selection: DishSelection): number {
    return unitPrice(dish, selection) * clampQuantity(selection.quantity);
}

/**
 * El ítem para el pedido, o `null` si todavía no se puede agregar: algún
 * grupo tiene un problema.
 */
export function toOrderItem(dish: MenuDish, selection: DishSelection): OrderItem | null {
    if (selectionProblems(dish, selection).some((problem) => problem !== null)) {
        return null;
    }

    const removed = dish.groups.flatMap((group, groupIndex) =>
        group.kind === 'removal' ? (selection.chosen[groupIndex] ?? []).flatMap((index) => group.options[index]?.name ?? []) : [],
    );
    const note = normalizeNote(selection.note);

    return {
        dish: dish.name,
        unitPrice: unitPrice(dish, selection),
        quantity: clampQuantity(selection.quantity),
        choices: chosenOptions(dish, selection),
        removed,
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
