<script setup lang="ts">
import { computed, ref } from 'vue';

import type { Campo } from './store';
import { t } from './texts';

/** El inicio de /campo: lo que falta enviar y lo ya enviado, con su estado. */
const { campo } = defineProps<{ campo: Campo }>();

const emit = defineEmits<{ create: []; resume: [uuid: string]; detail: [uuid: string] }>();

const message = ref('');
const pending = computed(() => campo.state.drafts.filter((draft) => draft.state === 'ready'));
const dates = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });

async function sendPending(): Promise<void> {
    message.value = '';
    const { sent, stoppedBy } = await campo.sendPending();

    message.value = stoppedBy === null ? t('home.sent_ok', { n: sent }) : t('home.sent_fail');
}

function remove(uuid: string): void {
    if (window.confirm(t('home.delete_confirm'))) {
        void campo.removeDraft(uuid);
    }
}

function statusOf(draft: { state: string; returnNote: string | null }): string {
    return draft.returnNote !== null && draft.state === 'editing' ? t('status.returned') : t(`status.${draft.state}`);
}
</script>

<template>
    <div class="home">
        <button type="button" class="btn btn--primary btn--block" @click="emit('create')">+ {{ t('home.new') }}</button>

        <button v-if="pending.length > 0" type="button" class="btn btn--block" :disabled="campo.state.busy || !campo.state.online" @click="sendPending">
            {{ campo.state.busy ? t('home.sending') : t('home.send_pending', { n: pending.length }) }}
        </button>
        <p v-if="message" class="notice" role="status">{{ message }}</p>

        <section aria-labelledby="campo-drafts">
            <h2 id="campo-drafts" class="section-title">{{ t('home.drafts') }}</h2>
            <p v-if="campo.state.drafts.length === 0" class="muted">{{ t('home.none_drafts') }}</p>
            <ul v-else class="cards">
                <li v-for="draft in campo.state.drafts" :key="draft.uuid" class="card">
                    <p class="card__title">{{ draft.name.trim() || t('home.unnamed') }}</p>
                    <p class="card__meta"><span class="badge" :class="`badge--${draft.state}`">{{ statusOf(draft) }}</span> · {{ dates.format(new Date(draft.updatedAt)) }}</p>
                    <div class="card__actions">
                        <button type="button" class="btn btn--primary" @click="emit('resume', draft.uuid)">{{ t('home.continue') }}</button>
                        <button type="button" class="btn btn--quiet" @click="remove(draft.uuid)">{{ t('home.delete') }}</button>
                    </div>
                </li>
            </ul>
        </section>

        <section aria-labelledby="campo-sent">
            <h2 id="campo-sent" class="section-title">{{ t('home.sent') }}</h2>
            <p v-if="campo.state.sent.length === 0" class="muted">{{ t('home.none_sent') }}</p>
            <ul v-else class="cards">
                <li v-for="item in campo.state.sent" :key="item.uuid" class="card">
                    <p class="card__title">{{ item.name }}</p>
                    <p class="card__meta"><span class="badge" :class="`badge--${item.status}`">{{ t(`status.${item.status}`) }}</span> · {{ dates.format(new Date(item.received_at)) }}</p>
                    <div class="card__actions">
                        <button type="button" class="btn" @click="emit('detail', item.uuid)">{{ t('home.continue') }}</button>
                    </div>
                </li>
            </ul>
            <button type="button" class="btn btn--quiet" :disabled="!campo.state.online" @click="campo.refresh()">{{ t('home.refresh') }}</button>
        </section>
    </div>
</template>
