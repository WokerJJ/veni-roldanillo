<script setup lang="ts">
import { computed, ref } from 'vue';

import type { ConfirmationLink } from './api';
import type { Campo } from './store';
import { t } from './texts';

/**
 * Una ficha ya enviada: su estado y lo que sigue. Con la captura «enviada, en
 * espera», se pide el enlace de un solo uso para el dueño y se abre WhatsApp
 * con el mensaje listo (ADR 0048): el administrador toca «Enviar» él mismo.
 * El enlace no se guarda en el teléfono; si se pierde, se pide otro.
 */
const { campo, uuid } = defineProps<{ campo: Campo; uuid: string }>();

const emit = defineEmits<{ back: []; correct: [uuid: string] }>();

const item = computed(() => campo.state.sent.find((candidate) => candidate.uuid === uuid) ?? null);
const link = ref<ConfirmationLink | null>(null);
const failed = ref(false);
const working = ref(false);
const dates = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function askOwner(): Promise<void> {
    working.value = true;
    failed.value = false;
    link.value = await campo.ownerLink(uuid);
    failed.value = link.value === null;
    working.value = false;
}

const hasLocalDraft = computed(() => campo.state.drafts.some((draft) => draft.uuid === uuid));
</script>

<template>
    <section class="detail" aria-labelledby="campo-detail-title">
        <button type="button" class="btn btn--quiet" @click="emit('back')">← {{ t('back') }}</button>

        <template v-if="item">
            <h2 id="campo-detail-title" class="wizard__title">{{ item.name }}</h2>
            <p><span class="badge" :class="`badge--${item.status}`">{{ t(`status.${item.status}`) }}</span></p>
            <p v-if="item.duplicates > 0" class="muted">{{ t('detail.duplicates', { n: item.duplicates }) }}</p>

            <template v-if="item.status === 'submitted'">
                <p>{{ t('detail.waiting') }}</p>
                <p class="field__help">{{ t('detail.ask_owner_help') }}</p>
                <button type="button" class="btn btn--primary btn--block" :disabled="working || !campo.state.online" @click="askOwner">{{ t('detail.ask_owner') }}</button>
                <p v-if="failed" class="field__error" role="alert">{{ t('detail.link_failed') }}</p>
                <template v-if="link">
                    <a class="btn btn--whatsapp btn--block" :href="link.whatsapp_url" target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    <p v-if="link.expires_at" class="field__help">{{ t('detail.expires', { date: dates.format(new Date(link.expires_at)) }) }}</p>
                </template>
            </template>

            <p v-else-if="item.status === 'owner_confirmed'">{{ t('detail.confirmed') }}</p>
            <p v-else-if="item.status === 'approved'">{{ t('detail.approved') }}</p>
            <p v-else-if="item.status === 'rejected'">{{ t('detail.rejected') }} {{ item.review_note }}</p>

            <template v-else-if="item.status === 'returned'">
                <p v-if="item.review_note" class="notice"><strong>{{ t('detail.returned_note') }}</strong> {{ item.review_note }}</p>
                <button v-if="hasLocalDraft" type="button" class="btn btn--primary btn--block" @click="emit('correct', uuid)">{{ t('detail.edit_returned') }}</button>
            </template>
        </template>
    </section>
</template>
