<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { ADDRESS_MAX_LENGTH, NAME_MAX_LENGTH, NEIGHBORHOOD_MAX_LENGTH, REFERENCE_MAX_LENGTH } from '@/order/checkout';
import type { AddressFields, AddressLabelKind, SavedAddress } from '@/saved/addresses';
import { LABEL_MAX_LENGTH, MAX_ADDRESSES, useAddressBook } from '@/saved/addresses';
import { clearAllSaved } from '@/saved/clearAll';
import { useFavorites } from '@/saved/favorites';
import { LABEL_KEYS, LABEL_KINDS, labelText, suggestedKind } from '@/saved/labels';

/**
 * Lo guardado en este teléfono (#16, ADR 0032): ver, agregar, editar y borrar
 * las direcciones de la libreta, quitar favoritos y «Borrar todo lo
 * guardado». Nada de esto va al servidor: lee y escribe `localStorage` con
 * saved/addresses.ts y saved/favorites.ts, y no hace ninguna petición.
 *
 * Es un <dialog> nativo con showModal(), como el carrito: en un celular sale
 * de abajo (ADR 0022) y desde 768 px queda centrado. Lo abren la lista del
 * inicio (con `restaurants`, para poner nombre a cada favorito) y el carrito
 * (sin ellos: solo las direcciones). Baja con import() al abrirlo: no pesa
 * en el arranque. Sin v-model ni .prevent, como el carrito: sumarían código
 * al chunk de Vue (resources/js/map/bundle.test.ts).
 */
const { restaurants = null } = defineProps<{
    /** Los restaurantes del mapa, para nombrar los favoritos; sin ellos, la sección no se muestra. */
    restaurants?: readonly { slug: string; name: string }[] | null;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const id = useId();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const title = useTemplateRef<HTMLElement>('title');

const book = useAddressBook();
const favorites = useFavorites();

/** La dirección que se está editando: su id, 'new' para una nueva o null. */
const editing = ref<string | null>(null);
const form = ref<AddressFields>(emptyForm());
const attempted = ref(false);
const confirmingClear = ref(false);
const announcement = ref('');
let pressedOnBackdrop = false;

const addressError = computed(() => (attempted.value && form.value.address.trim() === '' ? t('order.form.error_address') : null));

const favoriteRows = computed(() => {
    const names = new Map((restaurants ?? []).map(({ slug, name }) => [slug, name]));

    return favorites.slugs.value.map((slug) => ({ slug, name: names.get(slug) ?? null }));
});

function emptyForm(): AddressFields {
    return { label: { kind: 'home', text: '' }, neighborhood: '', address: '', reference: '', name: '' };
}

async function announce(text: string): Promise<void> {
    announcement.value = '';
    await nextTick();
    announcement.value = text;
}

function inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
}

function patch(fields: Partial<AddressFields>): void {
    form.value = { ...form.value, ...fields };
}

function onKind(kind: AddressLabelKind): void {
    patch({ label: { kind, text: form.value.label.text } });
}

async function focusField(selector: string): Promise<void> {
    await nextTick();
    dialog.value?.querySelector<HTMLElement>(selector)?.focus();
}

async function startNew(): Promise<void> {
    form.value = { ...emptyForm(), label: { kind: suggestedKind(book.addresses.value), text: '' } };
    attempted.value = false;
    editing.value = 'new';
    await focusField('[data-address-form] input');
}

async function startEdit(address: SavedAddress): Promise<void> {
    const { label, neighborhood, address: street, reference, name } = address;
    form.value = { label: { ...label }, neighborhood, address: street, reference, name };
    attempted.value = false;
    editing.value = address.id;
    await focusField('[data-address-form] input');
}

async function cancel(): Promise<void> {
    editing.value = null;
    await focusField('[data-address-add], [data-addresses-title]');
}

async function save(): Promise<void> {
    if (form.value.address.trim() === '') {
        attempted.value = true;
        await focusField('[data-form-address]');

        return;
    }

    const saved = book.save(form.value, editing.value === 'new' ? null : editing.value);
    editing.value = null;
    await announce(saved === null ? t('saved.full') : t('saved.address_saved', { label: labelText(form.value.label, t) }));
    await focusField('[data-addresses-title]');
}

async function remove(address: SavedAddress): Promise<void> {
    book.remove(address.id);
    await announce(t('saved.address_deleted', { label: labelText(address.label, t) }));
    await focusField('[data-addresses-title]');
}

async function removeFavorite(slug: string, name: string | null): Promise<void> {
    favorites.remove(slug);
    await announce(t('favorites.removed', { name: name ?? t('saved.favorite_missing') }));
    await focusField('[data-favorites-title]');
}

async function clearAll(): Promise<void> {
    clearAllSaved();
    confirmingClear.value = false;
    editing.value = null;
    title.value?.focus();
    await announce(t('saved.cleared'));
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

/**
 * El Escape cierra solo este diálogo (con `cancel`): no sigue hasta el
 * documento, donde el inicio cerraría también la lista de abajo.
 */
function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.stopPropagation();
    }
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
    <dialog ref="dialog" class="saved-sheet text-ink" :aria-labelledby="`${id}-title`" data-saved @cancel="onCancel" @keydown="onKeydown" @pointerdown="onPointerDown" @click="onClick">
        <header class="saved-sheet-header flex items-start justify-between gap-3 border-b border-line">
            <h2 :id="`${id}-title`" ref="title" tabindex="-1" class="text-xl">{{ t('saved.title') }}</h2>
            <button
                type="button"
                class="inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-surface"
                :aria-label="t('saved.close')"
                data-close
                @click="emit('close')"
            >
                <Icon name="cerrar" :size="20" />
            </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            <p class="mt-3 text-sm text-ink-muted">{{ t('saved.intro') }}</p>

            <section class="mt-4" :aria-labelledby="`${id}-addresses`">
                <h3 :id="`${id}-addresses`" tabindex="-1" class="text-lg" data-addresses-title>{{ t('saved.addresses') }}</h3>

                <p v-if="book.addresses.value.length === 0 && editing === null" class="mt-1" data-addresses-empty>{{ t('saved.addresses_empty') }}</p>

                <ul v-else class="mt-1 divide-y divide-line">
                    <li v-for="address in book.addresses.value" :key="address.id" class="py-3" data-saved-address>
                        <p class="font-semibold wrap-anywhere" data-saved-label>{{ labelText(address.label, t) }}</p>
                        <p class="wrap-anywhere">{{ address.address }}</p>
                        <p v-if="address.neighborhood || address.reference" class="text-sm wrap-anywhere text-ink-muted">
                            {{ [address.neighborhood, address.reference].filter(Boolean).join(' · ') }}
                        </p>
                        <p v-if="address.name" class="text-sm wrap-anywhere text-ink-muted">{{ address.name }}</p>
                        <div class="mt-1 flex flex-wrap gap-2">
                            <button
                                type="button"
                                class="inline-flex min-h-touch items-center rounded-full px-3 font-semibold underline underline-offset-4 hover:bg-surface"
                                :aria-label="t('saved.edit_label', { label: labelText(address.label, t) })"
                                data-address-edit
                                @click="startEdit(address)"
                            >
                                {{ t('saved.edit') }}
                            </button>
                            <button
                                type="button"
                                class="inline-flex min-h-touch items-center rounded-full px-3 font-semibold underline underline-offset-4 hover:bg-surface"
                                :aria-label="t('saved.delete_label', { label: labelText(address.label, t) })"
                                data-address-delete
                                @click="remove(address)"
                            >
                                {{ t('saved.delete') }}
                            </button>
                        </div>
                    </li>
                </ul>

                <form v-if="editing !== null" class="mt-3 rounded-veni-sm border border-line p-3" :aria-labelledby="`${id}-form`" novalidate data-address-form @submit="$event.preventDefault(), save()">
                    <h4 :id="`${id}-form`" class="font-semibold">{{ t(editing === 'new' ? 'saved.add_address' : 'saved.edit_address') }}</h4>

                    <fieldset class="mt-2">
                        <legend class="font-semibold">{{ t('address.label') }}</legend>
                        <label v-for="kind in LABEL_KINDS" :key="kind" class="flex min-h-touch cursor-pointer items-center gap-3">
                            <input type="radio" class="saved-check size-5 shrink-0" :name="`${id}-kind`" :checked="form.label.kind === kind" :data-kind="kind" @change="onKind(kind)">
                            <span>{{ t(LABEL_KEYS[kind]) }}</span>
                        </label>
                    </fieldset>

                    <div v-if="form.label.kind === 'other'" class="mt-2">
                        <label :for="`${id}-label`" class="font-semibold">{{ t('address.label_text') }}</label>
                        <input
                            :id="`${id}-label`"
                            type="text"
                            class="saved-field mt-1 block w-full border border-line bg-canvas px-2"
                            :value="form.label.text"
                            :maxlength="LABEL_MAX_LENGTH"
                            data-form-label
                            @input="patch({ label: { kind: 'other', text: inputValue($event) } })"
                        >
                    </div>

                    <div class="mt-2">
                        <label :for="`${id}-neighborhood`" class="font-semibold">{{ t('order.form.neighborhood') }}</label>
                        <input
                            :id="`${id}-neighborhood`"
                            type="text"
                            class="saved-field mt-1 block w-full border border-line bg-canvas px-2"
                            :value="form.neighborhood"
                            :maxlength="NEIGHBORHOOD_MAX_LENGTH"
                            data-form-neighborhood
                            @input="patch({ neighborhood: inputValue($event) })"
                        >
                    </div>

                    <div class="mt-2">
                        <label :for="`${id}-address`" class="font-semibold">{{ t('order.form.address') }}</label>
                        <input
                            :id="`${id}-address`"
                            type="text"
                            autocomplete="street-address"
                            class="saved-field mt-1 block w-full border border-line bg-canvas px-2"
                            :value="form.address"
                            :maxlength="ADDRESS_MAX_LENGTH"
                            :aria-invalid="addressError !== null"
                            :aria-describedby="addressError === null ? undefined : `${id}-address-error`"
                            data-form-address
                            @input="patch({ address: inputValue($event) })"
                        >
                        <p v-if="addressError" :id="`${id}-address-error`" class="mt-1 text-sm font-semibold" data-error>{{ addressError }}</p>
                    </div>

                    <div class="mt-2">
                        <label :for="`${id}-reference`" class="font-semibold">{{ t('order.form.reference') }}</label>
                        <input
                            :id="`${id}-reference`"
                            type="text"
                            class="saved-field mt-1 block w-full border border-line bg-canvas px-2"
                            :value="form.reference"
                            :maxlength="REFERENCE_MAX_LENGTH"
                            data-form-reference
                            @input="patch({ reference: inputValue($event) })"
                        >
                    </div>

                    <div class="mt-2">
                        <label :for="`${id}-name`" class="font-semibold">{{ t('order.form.name') }}</label>
                        <p :id="`${id}-name-hint`" class="text-sm text-ink-muted">{{ t('order.form.name_hint') }}</p>
                        <input
                            :id="`${id}-name`"
                            type="text"
                            autocomplete="given-name"
                            class="saved-field mt-1 block w-full border border-line bg-canvas px-2"
                            :value="form.name"
                            :maxlength="NAME_MAX_LENGTH"
                            :aria-describedby="`${id}-name-hint`"
                            data-form-name
                            @input="patch({ name: inputValue($event) })"
                        >
                    </div>

                    <div class="mt-3 flex flex-wrap gap-2">
                        <button type="submit" class="inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold" data-form-save>
                            {{ t('saved.save') }}
                        </button>
                        <button type="button" class="inline-flex min-h-touch items-center rounded-full px-4 hover:bg-surface" data-form-cancel @click="cancel">
                            {{ t('saved.cancel') }}
                        </button>
                    </div>
                </form>

                <template v-else>
                    <p v-if="book.full.value" class="mt-2 text-sm" data-addresses-full>{{ t('saved.full_hint', { max: MAX_ADDRESSES }) }}</p>
                    <button
                        v-else
                        type="button"
                        class="mt-2 inline-flex min-h-touch items-center gap-2 rounded-full border border-line px-4 font-semibold hover:bg-surface"
                        data-address-add
                        @click="startNew"
                    >
                        <Icon name="agregar" :size="20" />
                        {{ t('saved.add_address') }}
                    </button>
                </template>
            </section>

            <section v-if="restaurants !== null" class="mt-6 border-t border-line pt-4" :aria-labelledby="`${id}-favorites`">
                <h3 :id="`${id}-favorites`" tabindex="-1" class="text-lg" data-favorites-title>{{ t('favorites.title') }}</h3>
                <p v-if="favoriteRows.length === 0" class="mt-1" data-favorites-empty>{{ t('saved.favorites_empty') }}</p>
                <ul v-else class="mt-1 divide-y divide-line">
                    <li v-for="favorite in favoriteRows" :key="favorite.slug" class="flex items-center justify-between gap-3 py-2" data-saved-favorite>
                        <span class="min-w-0 wrap-anywhere">
                            <span v-if="favorite.name" class="font-semibold">{{ favorite.name }}</span>
                            <span v-else class="text-ink-muted">{{ t('saved.favorite_missing') }}</span>
                        </span>
                        <button
                            type="button"
                            class="inline-flex min-h-touch shrink-0 items-center rounded-full px-3 font-semibold underline underline-offset-4 hover:bg-surface"
                            :aria-label="t('saved.favorite_remove_label', { name: favorite.name ?? t('saved.favorite_missing') })"
                            data-favorite-remove
                            @click="removeFavorite(favorite.slug, favorite.name)"
                        >
                            {{ t('saved.favorite_remove') }}
                        </button>
                    </li>
                </ul>
            </section>

            <section class="mt-6 border-t border-line pt-4" :aria-labelledby="`${id}-clear`">
                <h3 :id="`${id}-clear`" class="text-lg">{{ t('saved.clear_all') }}</h3>
                <p class="text-sm text-ink-muted">{{ t('saved.clear_all_hint') }}</p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                    <template v-if="confirmingClear">
                        <p class="font-semibold" data-clear-all-confirm>{{ t('saved.clear_all_confirm') }}</p>
                        <button type="button" class="inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold" data-clear-all-yes @click="clearAll">
                            {{ t('saved.clear_all_yes') }}
                        </button>
                        <button type="button" class="inline-flex min-h-touch items-center rounded-full px-4 hover:bg-surface" data-clear-all-no @click="confirmingClear = false">
                            {{ t('order.cart.clear_no') }}
                        </button>
                    </template>
                    <button
                        v-else
                        type="button"
                        class="inline-flex min-h-touch items-center rounded-full border border-line px-4 font-semibold hover:bg-surface"
                        data-clear-all
                        @click="confirmingClear = true"
                    >
                        {{ t('saved.clear_all') }}
                    </button>
                </div>
            </section>
        </div>

        <p role="status" class="sr-only" data-announcement>{{ announcement }}</p>
    </dialog>
</template>

<style scoped>
/*
 * Como el carrito: estilos propios aquí y no utilidades nuevas de Tailwind,
 * cuyo CSS baja con el arranque. Sale de abajo en el celular (ADR 0022).
 */
.saved-sheet {
    margin: auto auto 0;
    width: 100%;
    max-width: 32rem;
    max-height: 92dvh;
    padding: 0;
    border: 0;
    border-radius: 1rem 1rem 0 0;
    background: var(--color-canvas);
}

.saved-sheet[open] {
    display: flex;
    flex-direction: column;
}

.saved-sheet::backdrop {
    background: rgb(0 0 0 / 0.5);
}

@media (min-width: 768px) {
    .saved-sheet {
        margin: auto;
        border-radius: 1rem;
    }
}

.saved-sheet-header {
    padding: 1rem 1rem 0.75rem;
}

.saved-field {
    min-height: 2.75rem;
    border-radius: 0.5rem;
}

.saved-check {
    accent-color: var(--color-veni-ciruela);
}

:global([data-theme='dark']) .saved-check {
    accent-color: var(--color-veni-mango);
}
</style>
