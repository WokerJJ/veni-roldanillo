<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { useLazyDialog } from '@/composables/useLazyDialog';
import { formatPesos } from '@/i18n/intl';
import type { DeliveryMode, DetailsField, OrderContext, OrderDetails } from '@/order/checkout';
import {
    ADDRESS_MAX_LENGTH,
    detailsProblems,
    emptyDetails,
    estimatedTotal,
    isDelivery,
    NAME_MAX_LENGTH,
    NEIGHBORHOOD_MAX_LENGTH,
    parseCash,
    REFERENCE_MAX_LENGTH,
} from '@/order/checkout';
import { recordOrderIntent } from '@/order/intent';
import { orderMessage, whatsappNumber, whatsappUrl } from '@/order/message';
import type { OrderItem } from '@/order/selection';
import { MAX_QUANTITY, MIN_QUANTITY } from '@/order/selection';
import { forgetDelivery, loadDelivery } from '@/order/storage';
import { useOrder } from '@/order/useOrder';
import type { PaymentMethod, RestaurantProfile } from '@/restaurants/profile';
import { PAYMENT_METHOD_KEYS } from '@/restaurants/profile';
import type { AddressLabel, AddressLabelKind, SavedAddress } from '@/saved/addresses';
import { isStored, LABEL_MAX_LENGTH, MAX_ADDRESSES, useAddressBook } from '@/saved/addresses';
import { LABEL_KEYS, LABEL_KINDS, labelText, suggestedKind } from '@/saved/labels';

/**
 * El carrito de un restaurante (#15, ADR 0024): las líneas del pedido (con sus
 * opciones, lo quitado y la nota), cambiar cantidades, quitar y vaciar; la
 * entrega (domicilio o recoger), el pago y el «Total estimado»; y el enlace
 * que abre WhatsApp con el mensaje listo. Vení no recibe el pedido: lo envía
 * la persona desde su WhatsApp (ADR 0004).
 *
 * Es un <dialog> nativo con showModal(), como el selector de platos: en un
 * celular vertical sale de abajo (ADR 0022) y desde 768 px queda centrado. Lo
 * carga OrderBar recién al tocar «Ver tu pedido»: no pesa en la ficha ni en
 * el arranque. Sin v-model ni .prevent: sumarían código al chunk de Vue, el
 * del arranque (resources/js/map/bundle.test.ts).
 *
 * Las direcciones salen de la libreta del teléfono (#16, ADR 0032): al abrir
 * se completa con la usada más recientemente, se puede elegir otra y, con
 * «Guardar esta dirección» marcada, se guarda o se pone al día al enviar. La
 * libreta se edita en SavedOnDevice.vue, que baja con import() al tocar
 * «Editar o borrar».
 *
 * La ubicación se pide solo si la persona toca «Agregar mi ubicación», vive
 * en este componente mientras está abierto y sale únicamente dentro del
 * texto del mensaje: no se guarda ni va al servidor ni a la URL de la app.
 * Al servidor va solo el aviso de que se tocó «Enviar» (order/intent.ts).
 */
const { restaurant } = defineProps<{
    restaurant: Pick<RestaurantProfile, 'slug' | 'name' | 'whatsapp' | 'delivery' | 'payment_methods'>;
}>();

const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();
const id = useId();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const title = useTemplateRef<HTMLElement>('title');

const order = useOrder(restaurant.slug);
const items = order.items;

const MODES: readonly DeliveryMode[] = ['delivery', 'pickup'];

const context = computed<OrderContext>(() => ({
    deliveryAvailable: restaurant.delivery.available,
    zones: restaurant.delivery.zones,
    // Un medio que esta versión no conoce no se ofrece como una clave suelta.
    paymentMethods: restaurant.payment_methods.filter((method) => method in PAYMENT_METHOD_KEYS),
}));

const number = computed(() => whatsappNumber(restaurant.whatsapp));

/*
| La libreta de direcciones (#16, ADR 0032): una para todos los restaurantes.
| Lo que «Recordar» guardaba por restaurante antes de ella (#15) pasa a la
| libreta la primera vez que se abre este carrito y se borra de donde estaba:
| un solo lugar para cada dirección. Se borra solo si quedó escrita en la
| libreta: llena o sin espacio, sigue donde estaba para la próxima vez.
*/
const book = useAddressBook();
const legacy = loadDelivery(restaurant.slug);

if (legacy !== null) {
    const { neighborhood, address, reference, name } = legacy;
    const empty = address.trim() === '' && neighborhood.trim() === '';
    const same = book.addresses.value.find((saved) => saved.address === address && saved.neighborhood === neighborhood);
    const moved = empty ? null : book.save({ label: same?.label ?? { kind: suggestedKind(book.addresses.value), text: '' }, neighborhood, address, reference, name }, same?.id ?? null);

    if (empty || (moved !== null && isStored(moved))) {
        forgetDelivery(restaurant.slug);
    }
}

/** La de la libreta que se está usando (al abrir, la usada más recientemente), o null. */
const initial = book.addresses.value[0] ?? null;
const activeId = ref<string | null>(initial?.id ?? null);
const label = ref<AddressLabel>(initial === null ? { kind: suggestedKind(book.addresses.value), text: '' } : { ...initial.label });
/** El barrio guardado que no está entre las zonas de este restaurante: se pide elegirlo. */
const neighborhoodMissing = ref<string | null>(null);
const rememberFull = ref(false);

/** Los campos del formulario que salen de una dirección guardada. Con zonas, el barrio solo si es una de ellas. */
function fromSaved(saved: SavedAddress): Partial<OrderDetails> {
    const zones = context.value.zones;
    const fits = zones.length === 0 || zones.some((zone) => zone.neighborhood === saved.neighborhood);
    neighborhoodMissing.value = fits || saved.neighborhood === '' ? null : saved.neighborhood;

    return { neighborhood: fits ? saved.neighborhood : '', address: saved.address, reference: saved.reference, name: saved.name };
}

const details = ref<OrderDetails>({
    ...emptyDetails(context.value),
    ...(legacy === null ? {} : { mode: legacy.mode }),
    ...(initial === null ? {} : fromSaved(initial)),
});
/** «Guardar esta dirección»: nunca arranca marcada, ni al completar con una guardada. */
const remember = ref(false);
/**
 * «Editar o borrar tus direcciones»: la pantalla de lo guardado, que baja con
 * import() al tocarlo. Al cerrarla, el foco vuelve a ese botón; si ya no está
 * (se borraron todas), al barrio o al título.
 */
const {
    Dialog: Manager,
    open: managing,
    show: openManager,
    close: closeManager,
} = useLazyDialog(
    () => import('@/components/SavedOnDevice.vue'),
    'carrito',
    () => {
        (dialog.value?.querySelector<HTMLElement>('[data-saved-manage], [data-neighborhood]') ?? title.value)?.focus();
    },
);
/** Lo que se escribe en «¿Con cuánto pagás?», tal cual. */
const cashText = ref('');
type LocationState = 'idle' | 'locating' | 'denied' | 'error';
const locationState = ref<LocationState>('idle');

const attempted = ref(false);
const confirmingClear = ref(false);
const announcement = ref('');
const alertText = ref('');
let pressedOnBackdrop = false;

const delivery = computed(() => isDelivery(details.value, context.value));
const totals = computed(() => estimatedTotal(items.value, details.value, context.value));
const money = (amount: number): string => formatPesos(amount, locale.value);

const cashInvalid = computed(() => details.value.payment === 'cash' && cashText.value.trim() !== '' && details.value.cashAmount === null);

const problems = computed(() => {
    const found = new Map<DetailsField, string>();

    for (const problem of detailsProblems(items.value, details.value, context.value)) {
        switch (problem.field) {
            case 'neighborhood':
                found.set('neighborhood', t(context.value.zones.length > 0 ? 'order.form.error_neighborhood' : 'order.form.error_neighborhood_free'));
                break;
            case 'address':
                found.set('address', t('order.form.error_address'));
                break;
            case 'payment':
                found.set('payment', t('order.form.error_payment'));
                break;
            case 'cash':
                found.set('cash', t('order.form.error_cash_short', { total: money(problem.total) }));
                break;
        }
    }

    if (cashInvalid.value) {
        found.set('cash', t('order.form.error_cash'));
    }

    return found;
});

function errorFor(field: DetailsField): string | null {
    return attempted.value ? (problems.value.get(field) ?? null) : null;
}

/** El barrio guardado que falta elegir de la lista, mientras no se elige otro. */
const missingNeighborhood = computed(() => (details.value.neighborhood === '' ? neighborhoodMissing.value : null));

function describedBy(field: DetailsField, hint: boolean): string | undefined {
    const ids = [
        hint ? `${id}-${field}-hint` : null,
        field === 'neighborhood' && missingNeighborhood.value !== null ? `${id}-neighborhood-saved` : null,
        errorFor(field) === null ? null : `${id}-${field}-error`,
    ].filter((value) => value !== null);

    return ids.length === 0 ? undefined : ids.join(' ');
}

const message = computed(() => orderMessage(items.value, details.value, context.value, t, money));
const href = computed(() => (number.value === null ? null : whatsappUrl(number.value, message.value)));

/**
 * Una clave estable por línea, su firma sin la cantidad (lo que la hace
 * única, ver sameLine): al quitar una, las demás conservan su elemento y el
 * <output> de cantidad no anuncia un cambio que no hubo. Si una firma se
 * repite (un carrito guardado a mano), se numera.
 */
const lineKeys = computed(() => {
    const seen = new Map<string, number>();

    return items.value.map((item) => {
        const signature = JSON.stringify([
            item.dish,
            item.unitPrice,
            item.note,
            item.removed,
            item.choices.map((choice) => [choice.group, choice.name, choice.price]),
            item.missing ?? [],
            item.swaps ?? [],
        ]);
        const repeated = seen.get(signature) ?? 0;
        seen.set(signature, repeated + 1);

        return repeated === 0 ? signature : `${signature}#${String(repeated)}`;
    });
});

/** Lo que va debajo del nombre de una línea: opciones, reemplazos, lo quitado y lo que hoy no hay (ADR 0033). */
function lineDetails(item: OrderItem): string {
    return [
        ...item.choices.map((choice) => choice.name),
        ...(item.swaps ?? []).map((swap) => t('order.picker.swap_accept', { substitute: swap.name, name: swap.instead })),
        ...item.removed.map((name) => t('order.picker.remove_option', { name })),
        ...(item.missing ?? []).map((name) => t('order.picker.missing_option', { name })),
    ].join(' · ');
}

const feeText = computed(() => {
    const fee = totals.value.fee;

    if (fee !== null) {
        return money(fee);
    }

    return context.value.zones.length > 0 ? t('order.cart.delivery_choose') : t('order.cart.delivery_pending');
});

/** Vaciar y volver a escribir: así la región viva lo anuncia cada vez. */
async function announce(text: string, target: 'status' | 'alert' = 'status'): Promise<void> {
    const region = target === 'status' ? announcement : alertText;
    region.value = '';
    await nextTick();
    region.value = text;
}

function update(patch: Partial<OrderDetails>): void {
    details.value = { ...details.value, ...patch };
}

function inputValue(event: Event): string {
    const target = event.target;

    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement ? target.value : '';
}

function onMode(mode: DeliveryMode): void {
    update({ mode });
}

function onPayment(payment: PaymentMethod): void {
    update({ payment, cashAmount: payment === 'cash' ? parseCash(cashText.value) : null });
}

function onCash(event: Event): void {
    cashText.value = inputValue(event);
    update({ cashAmount: parseCash(cashText.value) });
}

function onRemember(event: Event): void {
    const box = event.target instanceof HTMLInputElement ? event.target : null;

    // Con la libreta llena no entra otra: la casilla vuelve a quedar sin marcar, y se dice por qué.
    if (box !== null && box.checked && activeId.value === null && book.full.value) {
        box.checked = false;
        rememberFull.value = true;

        return;
    }

    rememberFull.value = false;
    remember.value = box?.checked === true;

    // Una dirección nueva se guarda apenas se marca; una de la libreta se pone al día al enviar.
    if (remember.value && activeId.value === null) {
        saveAddress();
    }
}

function onLabelKind(kind: AddressLabelKind): void {
    label.value = { kind, text: label.value.text };
}

function onLabelText(event: Event): void {
    label.value = { kind: 'other', text: inputValue(event) };
}

/**
 * «Guardar esta dirección» (antes «Recordar», #15): con la casilla marcada,
 * la dirección del formulario queda en la libreta (una nueva, apenas se
 * marca) y los cambios se guardan al enviar el pedido, no con cada tecla.
 * Desmarcarla no borra nada: solo deja de ponerla al día (se borra en
 * «Editar o borrar» o con «Borrar esta dirección»). Solo barrio, dirección,
 * referencia y nombre: nunca la ubicación ni el pago. Sin dirección ni barrio
 * todavía, no hay qué guardar.
 */
function saveAddress(): void {
    const { neighborhood, address, reference, name } = details.value;

    if (address.trim() === '' && neighborhood.trim() === '') {
        return;
    }

    // Con zonas, un barrio guardado que no es de este restaurante queda sin elegir: no se pisa con el vacío.
    const kept = neighborhood === '' && context.value.zones.length > 0 ? (book.addresses.value.find((saved) => saved.id === activeId.value)?.neighborhood ?? '') : neighborhood;
    const saved = book.save({ label: label.value, neighborhood: kept, address, reference, name }, activeId.value);

    if (saved === null) {
        remember.value = false;
        rememberFull.value = true;
    } else {
        activeId.value = saved;
    }
}

// Si la dirección en uso se borró (desde «Editar o borrar», o en otra pestaña), el formulario queda, sin guardar.
watch(book.addresses, (addresses) => {
    if (activeId.value !== null && !addresses.some((saved) => saved.id === activeId.value)) {
        activeId.value = null;
        remember.value = false;
    }
});

/** Elegir una de la libreta completa el formulario; «Otra dirección» lo deja en blanco (el nombre queda). */
async function choose(saved: SavedAddress | null): Promise<void> {
    rememberFull.value = false;

    if (saved === null) {
        activeId.value = null;
        remember.value = false;
        label.value = { kind: suggestedKind(book.addresses.value), text: '' };
        neighborhoodMissing.value = null;
        update({ neighborhood: '', address: '', reference: '' });

        return;
    }

    activeId.value = saved.id;
    label.value = { ...saved.label };
    remember.value = false;
    update(fromSaved(saved));
    await announce(t('order.form.saved_used', { label: labelText(saved.label, t) }));
}

async function forget(): Promise<void> {
    if (activeId.value !== null) {
        book.remove(activeId.value);
        activeId.value = null;
    }

    remember.value = false;
    neighborhoodMissing.value = null;
    update({ neighborhood: '', address: '', reference: '', name: '' });
    await announce(t('order.form.forgotten'));
}

function step(index: number, delta: number): void {
    const item = items.value[index];

    if (item !== undefined) {
        order.setQuantity(index, item.quantity + delta);
    }
}

async function remove(index: number): Promise<void> {
    const item = items.value[index];
    order.remove(index);
    title.value?.focus();

    if (item !== undefined) {
        await announce(t('order.cart.removed', { name: item.dish }));
    }
}

async function clear(): Promise<void> {
    order.clear();
    confirmingClear.value = false;
    title.value?.focus();
    await announce(t('order.cart.cleared'));
}

function locate(): void {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator) || (navigator.geolocation as Geolocation | null) === null) {
        locationState.value = 'error';

        return;
    }

    locationState.value = 'locating';
    navigator.geolocation.getCurrentPosition(
        (position) => {
            locationState.value = 'idle';
            update({ location: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy } });
            void announce(t('order.form.location_added', { meters: Math.round(position.coords.accuracy) }));
        },
        (error) => {
            locationState.value = error.code === 1 ? 'denied' : 'error';
        },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
}

async function forgetLocation(): Promise<void> {
    update({ location: null });
    locationState.value = 'idle';
    await announce(t('order.form.location_removed'));
}

/**
 * «Enviar» es un enlace real a wa.me (se puede abrir, copiar o mantener
 * presionado) solo con el pedido completo. Mientras falta algo es un botón,
 * sin la dirección de wa.me que se podría abrir igual desde el menú del
 * enlace: marca cada campo, lo anuncia y lleva el foco al primero.
 */
async function onSend(event: MouseEvent): Promise<void> {
    if (problems.value.size > 0) {
        event.preventDefault();
        attempted.value = true;
        await announce(t('order.form.errors'), 'alert');

        const first = ['neighborhood', 'address', 'payment', 'cash'].find((field) => problems.value.has(field as DetailsField));
        dialog.value?.querySelector<HTMLElement>(`[data-field="${String(first)}"] :is(input, select)`)?.focus();

        return;
    }

    // El aviso para las estadísticas del dueño (#22, ADR 0031): sin esperar
    // la respuesta ni frenar el enlace, y solo con domicilio o recoger.
    recordOrderIntent(restaurant.slug, delivery.value ? 'delivery' : 'pickup');

    // Al recoger no se toca la libreta. Con domicilio, la dirección enviada queda como la usada más recientemente.
    if (delivery.value) {
        if (remember.value) {
            saveAddress();
        } else if (activeId.value !== null) {
            book.touch(activeId.value);
        }
    }

    await announce(t('order.form.sent'));
}

function onPointerDown(event: PointerEvent): void {
    pressedOnBackdrop = event.target === dialog.value;
}

/** Un toque en el fondo cierra, como Escape, solo si también empezó ahí. */
function onClick(event: MouseEvent): void {
    const fromBackdrop = pressedOnBackdrop;
    pressedOnBackdrop = false;

    if (fromBackdrop && event.target === dialog.value) {
        emit('close');
    }
}

function onCancel(event: Event): void {
    event.preventDefault();
    emit('close');
}

onMounted(() => {
    const element = dialog.value;

    if (element === null) {
        return;
    }

    if (typeof element.showModal === 'function') {
        element.showModal();
    } else {
        element.setAttribute('open', '');
    }

    title.value?.focus();
});

onBeforeUnmount(() => {
    if (dialog.value?.open === true && typeof dialog.value.close === 'function') {
        dialog.value.close();
    }
});
</script>

<template>
    <dialog ref="dialog" class="order-cart text-ink" :aria-labelledby="`${id}-title`" data-order-cart @cancel="onCancel" @pointerdown="onPointerDown" @click="onClick">
        <header class="order-cart-header flex items-start justify-between gap-3 border-b border-line">
            <div class="min-w-0">
                <h2 :id="`${id}-title`" ref="title" tabindex="-1" class="text-xl">{{ t('order.cart.title') }}</h2>
                <p class="text-sm wrap-anywhere text-ink-muted">{{ restaurant.name }}</p>
            </div>
            <button
                type="button"
                class="inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-surface"
                :aria-label="t('order.picker.close')"
                data-close
                @click="emit('close')"
            >
                <Icon name="cerrar" :size="20" />
            </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            <p v-if="items.length === 0" class="mt-4" data-empty>{{ t('order.cart.empty') }}</p>

            <template v-else>
                <ul class="mt-2 divide-y divide-line" :aria-label="t('order.cart.lines')">
                    <li v-for="(item, index) in items" :key="lineKeys[index]" class="py-3" data-line>
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p class="font-semibold wrap-anywhere">{{ item.dish }}</p>
                                <p v-if="lineDetails(item)" class="text-sm wrap-anywhere text-ink-muted" data-line-details>{{ lineDetails(item) }}</p>
                                <p v-if="item.note" class="text-sm wrap-anywhere text-ink-muted" data-line-note>{{ t('order.cart.note', { note: item.note }) }}</p>
                            </div>
                            <div class="shrink-0 text-right tabular-nums">
                                <p class="font-semibold" data-line-price>{{ money(item.unitPrice * item.quantity) }}</p>
                                <p v-if="item.quantity > 1" class="text-sm text-ink-muted">{{ t('order.cart.each', { price: money(item.unitPrice) }) }}</p>
                            </div>
                        </div>
                        <div class="mt-1 flex items-center justify-between gap-3">
                            <div class="flex items-center gap-1" role="group" :aria-label="t('order.cart.quantity_of', { name: item.dish })">
                                <button
                                    type="button"
                                    class="order-cart-step inline-flex size-touch items-center justify-center rounded-full border border-line text-xl"
                                    :aria-label="t('order.cart.decrease', { name: item.dish })"
                                    :disabled="item.quantity <= MIN_QUANTITY"
                                    data-decrease
                                    @click="step(index, -1)"
                                >
                                    −
                                </button>
                                <output class="order-cart-quantity text-center font-semibold tabular-nums" aria-live="polite" data-quantity>{{ item.quantity }}</output>
                                <button
                                    type="button"
                                    class="order-cart-step inline-flex size-touch items-center justify-center rounded-full border border-line text-xl"
                                    :aria-label="t('order.cart.increase', { name: item.dish })"
                                    :disabled="item.quantity >= MAX_QUANTITY"
                                    data-increase
                                    @click="step(index, 1)"
                                >
                                    +
                                </button>
                            </div>
                            <button
                                type="button"
                                class="inline-flex min-h-touch items-center rounded-full px-3 font-semibold underline underline-offset-4 hover:bg-surface"
                                :aria-label="t('order.cart.remove_label', { name: item.dish })"
                                data-remove
                                @click="remove(index)"
                            >
                                {{ t('order.cart.remove') }}
                            </button>
                        </div>
                    </li>
                </ul>

                <div class="flex flex-wrap items-center gap-2 border-t border-line py-2">
                    <template v-if="confirmingClear">
                        <p class="font-semibold" data-clear-confirm>{{ t('order.cart.clear_confirm') }}</p>
                        <button type="button" class="inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold" data-clear-yes @click="clear">
                            {{ t('order.cart.clear_yes') }}
                        </button>
                        <button type="button" class="inline-flex min-h-touch items-center rounded-full px-4 hover:bg-surface" data-clear-no @click="confirmingClear = false">
                            {{ t('order.cart.clear_no') }}
                        </button>
                    </template>
                    <button v-else type="button" class="inline-flex min-h-touch items-center rounded-full px-3 font-semibold underline underline-offset-4 hover:bg-surface" data-clear @click="confirmingClear = true">
                        {{ t('order.cart.clear') }}
                    </button>
                </div>
                <p class="text-sm text-ink-muted">{{ t('order.cart.saved_hint') }}</p>

                <p v-if="href === null" class="mt-4 flex items-start gap-2 rounded-veni-sm border border-line bg-surface p-3" data-no-whatsapp>
                    <Icon name="informacion" :size="20" class="shrink-0" />
                    <span>{{ t('order.cart.no_whatsapp') }}</span>
                </p>

                <section v-else class="mt-4 border-t border-line pt-4" :aria-labelledby="`${id}-form`" data-order-form>
                    <h3 :id="`${id}-form`" class="text-lg">{{ t('order.form.title') }}</h3>

                    <fieldset v-if="context.deliveryAvailable" class="mt-3" data-field="mode">
                        <legend class="font-semibold">{{ t('order.form.mode') }}</legend>
                        <label v-for="mode in MODES" :key="mode" class="flex min-h-touch cursor-pointer items-center gap-3">
                            <input
                                type="radio"
                                class="order-cart-check size-5 shrink-0"
                                :name="`${id}-mode`"
                                :checked="details.mode === mode"
                                :data-mode="mode"
                                @change="onMode(mode)"
                            >
                            <span>{{ t(mode === 'delivery' ? 'order.form.mode_delivery' : 'order.form.mode_pickup') }}</span>
                        </label>
                    </fieldset>

                    <template v-if="delivery">
                        <!-- La libreta (#16): elegir una completa el formulario; lo de abajo se puede cambiar igual. -->
                        <fieldset v-if="book.addresses.value.length > 0" class="mt-3" data-saved-addresses>
                            <legend class="font-semibold">{{ t('order.form.saved_addresses') }}</legend>
                            <label v-for="saved in book.addresses.value" :key="saved.id" class="flex min-h-touch cursor-pointer items-start gap-3 py-1">
                                <input
                                    type="radio"
                                    class="order-cart-check mt-0.5 size-5 shrink-0"
                                    :name="`${id}-saved`"
                                    :checked="activeId === saved.id"
                                    :data-saved-address="saved.id"
                                    @change="choose(saved)"
                                >
                                <span class="min-w-0">
                                    <span class="block font-semibold wrap-anywhere">{{ labelText(saved.label, t) }}</span>
                                    <span class="block text-sm wrap-anywhere text-ink-muted">{{ saved.address }}</span>
                                </span>
                            </label>
                            <label class="flex min-h-touch cursor-pointer items-center gap-3">
                                <input type="radio" class="order-cart-check size-5 shrink-0" :name="`${id}-saved`" :checked="activeId === null" data-saved-other @change="choose(null)">
                                <span>{{ t('order.form.saved_other') }}</span>
                            </label>
                            <button
                                type="button"
                                class="inline-flex min-h-touch items-center rounded-full px-3 font-semibold underline underline-offset-4 hover:bg-surface"
                                data-saved-manage
                                @click="openManager"
                            >
                                {{ t('order.form.saved_manage') }}
                            </button>
                        </fieldset>

                        <div class="mt-3" data-field="neighborhood">
                            <label :for="`${id}-neighborhood`" class="font-semibold">{{ t('order.form.neighborhood') }}</label>
                            <p :id="`${id}-neighborhood-hint`" class="text-sm text-ink-muted">
                                {{ t(context.zones.length > 0 ? 'order.form.neighborhood_hint' : 'order.form.neighborhood_free_hint') }}
                            </p>
                            <p v-if="missingNeighborhood" :id="`${id}-neighborhood-saved`" class="text-sm font-semibold" data-neighborhood-missing>
                                {{ t('order.form.saved_neighborhood_missing', { name: missingNeighborhood }) }}
                            </p>
                            <select
                                v-if="context.zones.length > 0"
                                :id="`${id}-neighborhood`"
                                class="order-cart-field mt-1 block w-full border border-line bg-canvas px-2"
                                :aria-describedby="describedBy('neighborhood', true)"
                                :aria-invalid="errorFor('neighborhood') !== null"
                                data-neighborhood
                                @change="update({ neighborhood: inputValue($event) })"
                            >
                                <option value="" :selected="details.neighborhood === ''">{{ t('order.form.neighborhood_choose') }}</option>
                                <option v-for="zone in context.zones" :key="zone.neighborhood" :value="zone.neighborhood" :selected="details.neighborhood === zone.neighborhood">
                                    {{ t('order.form.neighborhood_option', { name: zone.neighborhood, fee: money(zone.fee) }) }}
                                </option>
                            </select>
                            <input
                                v-else
                                :id="`${id}-neighborhood`"
                                type="text"
                                class="order-cart-field mt-1 block w-full border border-line bg-canvas px-2"
                                :value="details.neighborhood"
                                :maxlength="NEIGHBORHOOD_MAX_LENGTH"
                                :aria-describedby="describedBy('neighborhood', true)"
                                :aria-invalid="errorFor('neighborhood') !== null"
                                data-neighborhood
                                @input="update({ neighborhood: inputValue($event) })"
                            >
                            <p v-if="errorFor('neighborhood')" :id="`${id}-neighborhood-error`" class="mt-1 text-sm font-semibold" data-error>{{ errorFor('neighborhood') }}</p>
                        </div>

                        <div class="mt-3" data-field="address">
                            <label :for="`${id}-address`" class="font-semibold">{{ t('order.form.address') }}</label>
                            <p :id="`${id}-address-hint`" class="text-sm text-ink-muted">{{ t('order.form.address_hint') }}</p>
                            <input
                                :id="`${id}-address`"
                                type="text"
                                autocomplete="street-address"
                                class="order-cart-field mt-1 block w-full border border-line bg-canvas px-2"
                                :value="details.address"
                                :maxlength="ADDRESS_MAX_LENGTH"
                                :aria-describedby="describedBy('address', true)"
                                :aria-invalid="errorFor('address') !== null"
                                data-address
                                @input="update({ address: inputValue($event) })"
                            >
                            <p v-if="errorFor('address')" :id="`${id}-address-error`" class="mt-1 text-sm font-semibold" data-error>{{ errorFor('address') }}</p>
                        </div>

                        <div class="mt-3">
                            <label :for="`${id}-reference`" class="font-semibold">{{ t('order.form.reference') }}</label>
                            <p :id="`${id}-reference-hint`" class="text-sm text-ink-muted">{{ t('order.form.reference_hint') }}</p>
                            <input
                                :id="`${id}-reference`"
                                type="text"
                                class="order-cart-field mt-1 block w-full border border-line bg-canvas px-2"
                                :value="details.reference"
                                :maxlength="REFERENCE_MAX_LENGTH"
                                :aria-describedby="`${id}-reference-hint`"
                                data-reference
                                @input="update({ reference: inputValue($event) })"
                            >
                        </div>

                        <div class="mt-3" data-location>
                            <p class="font-semibold">{{ t('order.form.location') }}</p>
                            <p :id="`${id}-location-hint`" class="text-sm text-ink-muted">{{ t('order.form.location_hint') }}</p>
                            <template v-if="details.location">
                                <p class="mt-1 flex items-start gap-2" data-location-added>
                                    <Icon name="ubicacion" :size="20" class="mt-0.5 shrink-0" />
                                    <span>{{ t('order.form.location_added', { meters: Math.round(details.location.accuracy) }) }}</span>
                                </p>
                                <button type="button" class="mt-1 inline-flex min-h-touch items-center rounded-full px-3 font-semibold underline underline-offset-4 hover:bg-surface" data-location-remove @click="forgetLocation">
                                    {{ t('order.form.location_remove') }}
                                </button>
                            </template>
                            <template v-else>
                                <button
                                    type="button"
                                    class="mt-1 inline-flex min-h-touch items-center gap-2 rounded-full border border-line px-4 font-semibold hover:bg-surface"
                                    :aria-describedby="`${id}-location-hint`"
                                    :disabled="locationState === 'locating'"
                                    data-location-add
                                    @click="locate"
                                >
                                    <Icon name="ubicacion" :size="20" />
                                    {{ t(locationState === 'locating' ? 'order.form.location_locating' : 'order.form.location_add') }}
                                </button>
                                <p v-if="locationState === 'denied' || locationState === 'error'" class="mt-1 text-sm" role="status" data-location-error>
                                    {{ t(locationState === 'denied' ? 'order.form.location_denied' : 'order.form.location_error') }}
                                </p>
                            </template>
                        </div>
                    </template>

                    <div class="mt-3">
                        <label :for="`${id}-name`" class="font-semibold">{{ t('order.form.name') }}</label>
                        <p :id="`${id}-name-hint`" class="text-sm text-ink-muted">{{ t('order.form.name_hint') }}</p>
                        <input
                            :id="`${id}-name`"
                            type="text"
                            autocomplete="given-name"
                            class="order-cart-field mt-1 block w-full border border-line bg-canvas px-2"
                            :value="details.name"
                            :maxlength="NAME_MAX_LENGTH"
                            :aria-describedby="`${id}-name-hint`"
                            data-name
                            @input="update({ name: inputValue($event) })"
                        >
                    </div>

                    <fieldset
                        v-if="context.paymentMethods.length > 0"
                        class="mt-3"
                        data-field="payment"
                        :aria-describedby="errorFor('payment') === null ? undefined : `${id}-payment-error`"
                    >
                        <legend class="font-semibold">{{ t('order.form.payment') }}</legend>
                        <p v-if="errorFor('payment')" :id="`${id}-payment-error`" class="text-sm font-semibold" data-error>{{ errorFor('payment') }}</p>
                        <label v-for="method in context.paymentMethods" :key="method" class="flex min-h-touch cursor-pointer items-center gap-3">
                            <input
                                type="radio"
                                class="order-cart-check size-5 shrink-0"
                                :name="`${id}-payment`"
                                :checked="details.payment === method"
                                :data-payment="method"
                                @change="onPayment(method)"
                            >
                            <span>{{ t(PAYMENT_METHOD_KEYS[method]) }}</span>
                        </label>
                    </fieldset>

                    <div v-if="details.payment === 'cash'" class="mt-3" data-field="cash">
                        <label :for="`${id}-cash`" class="font-semibold">{{ t('order.form.cash_amount') }}</label>
                        <p :id="`${id}-cash-hint`" class="text-sm text-ink-muted">{{ t('order.form.cash_hint') }}</p>
                        <input
                            :id="`${id}-cash`"
                            type="text"
                            inputmode="numeric"
                            autocomplete="off"
                            class="order-cart-field mt-1 block w-full border border-line bg-canvas px-2"
                            :value="cashText"
                            maxlength="12"
                            :aria-describedby="describedBy('cash', true)"
                            :aria-invalid="errorFor('cash') !== null"
                            data-cash
                            @input="onCash"
                        >
                        <p v-if="errorFor('cash')" :id="`${id}-cash-error`" class="mt-1 text-sm font-semibold" data-error>{{ errorFor('cash') }}</p>
                    </div>

                    <div v-if="delivery" class="mt-4" data-remember-block>
                        <label class="flex min-h-touch cursor-pointer items-start gap-3 py-1">
                            <input
                                type="checkbox"
                                class="order-cart-check mt-0.5 size-5 shrink-0"
                                :checked="remember"
                                :aria-describedby="`${id}-remember-hint`"
                                data-remember
                                @change="onRemember"
                            >
                            <span>{{ t('order.form.remember') }}</span>
                        </label>
                        <p :id="`${id}-remember-hint`" class="text-sm text-ink-muted">{{ t('order.form.remember_hint') }}</p>
                        <p v-if="rememberFull" class="mt-1 text-sm font-semibold" role="status" data-remember-full>{{ t('order.form.remember_full', { max: MAX_ADDRESSES }) }}</p>

                        <fieldset v-if="remember" class="mt-2" data-label>
                            <legend class="font-semibold">{{ t('address.label') }}</legend>
                            <label v-for="kind in LABEL_KINDS" :key="kind" class="flex min-h-touch cursor-pointer items-center gap-3">
                                <input
                                    type="radio"
                                    class="order-cart-check size-5 shrink-0"
                                    :name="`${id}-label`"
                                    :checked="label.kind === kind"
                                    :data-label-kind="kind"
                                    @change="onLabelKind(kind)"
                                >
                                <span>{{ t(LABEL_KEYS[kind]) }}</span>
                            </label>
                            <div v-if="label.kind === 'other'" class="mt-1">
                                <label :for="`${id}-label-text`" class="font-semibold">{{ t('address.label_text') }}</label>
                                <input
                                    :id="`${id}-label-text`"
                                    type="text"
                                    class="order-cart-field mt-1 block w-full border border-line bg-canvas px-2"
                                    :value="label.text"
                                    :maxlength="LABEL_MAX_LENGTH"
                                    data-label-text
                                    @input="onLabelText"
                                >
                            </div>
                        </fieldset>

                        <button
                            v-if="remember"
                            type="button"
                            class="mt-1 inline-flex min-h-touch items-center rounded-full px-3 font-semibold underline underline-offset-4 hover:bg-surface"
                            data-forget
                            @click="forget"
                        >
                            {{ t('order.form.forget') }}
                        </button>
                    </div>
                </section>
            </template>
        </div>

        <footer v-if="items.length > 0" class="order-cart-footer border-t border-line">
            <dl class="order-cart-totals tabular-nums" data-totals>
                <template v-if="delivery">
                    <dt>{{ t('order.cart.subtotal') }}</dt>
                    <dd class="text-right" data-subtotal>{{ money(totals.items) }}</dd>
                    <dt>{{ t('order.cart.delivery_fee') }}</dt>
                    <dd class="text-right" data-fee>{{ feeText }}</dd>
                </template>
                <dt class="font-semibold">{{ t('order.cart.total') }}</dt>
                <dd class="text-right font-semibold" data-total>
                    {{ totals.fee === null ? t('order.cart.total_plus_delivery', { amount: money(totals.total) }) : money(totals.total) }}
                </dd>
            </dl>
            <p class="mt-1 text-sm text-ink-muted">{{ t('order.cart.total_hint') }}</p>
            <template v-if="href !== null">
                <a
                    v-if="problems.size === 0"
                    :href="href"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-2 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                    :aria-describedby="`${id}-send-hint`"
                    data-send
                    @click="onSend"
                >
                    <Icon name="enlace-externo" :size="20" />
                    {{ t('order.form.send') }}
                </a>
                <button
                    v-else
                    type="button"
                    class="mt-2 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-full bg-veni-ciruela px-5 font-semibold text-veni-blanco hover:bg-veni-ciruela-suave dark:bg-veni-mango dark:text-veni-ciruela dark:hover:bg-veni-blanco"
                    :aria-describedby="`${id}-send-hint`"
                    data-send
                    @click="onSend"
                >
                    <Icon name="enlace-externo" :size="20" />
                    {{ t('order.form.send') }}
                </button>
                <p :id="`${id}-send-hint`" class="mt-1 text-center text-sm text-ink-muted">{{ t('order.form.send_hint') }}</p>
            </template>
        </footer>

        <p role="status" class="sr-only" data-announcement>{{ announcement }}</p>
        <p role="alert" class="sr-only" data-alert>{{ alertText }}</p>

        <!-- «Editar o borrar tus direcciones»: otro diálogo encima de este, solo con la libreta. -->
        <Manager v-if="managing" @close="closeManager" />
    </dialog>
</template>

<style scoped>
/*
 * Estilos propios del carrito, aquí y no en utilidades nuevas de Tailwind:
 * el CSS de Tailwind baja con el arranque; este va en el chunk del carrito.
 * La hoja sale de abajo en el celular, como el selector y el panel del mapa
 * (ADR 0022).
 */
.order-cart {
    margin: auto auto 0;
    width: 100%;
    max-width: 32rem;
    max-height: 92dvh;
    padding: 0;
    border: 0;
    border-radius: 1rem 1rem 0 0;
    background: var(--color-canvas);
}

.order-cart[open] {
    display: flex;
    flex-direction: column;
}

.order-cart::backdrop {
    background: rgb(0 0 0 / 0.5);
}

@media (min-width: 768px) {
    .order-cart {
        margin: auto;
        border-radius: 1rem;
    }
}

.order-cart-header {
    padding: 1rem 1rem 0.75rem;
}

.order-cart-footer {
    padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
}

.order-cart-field {
    min-height: 2.75rem;
    border-radius: 0.5rem;
}

.order-cart-check {
    accent-color: var(--color-veni-ciruela);
}

:global([data-theme='dark']) .order-cart-check {
    accent-color: var(--color-veni-mango);
}

.order-cart-step:disabled {
    opacity: 0.4;
}

.order-cart-totals {
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 1rem;
}

.order-cart-quantity {
    width: 2rem;
}
</style>
