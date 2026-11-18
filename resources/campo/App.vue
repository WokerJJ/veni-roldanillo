<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import DetailView from './DetailView.vue';
import HomeView from './HomeView.vue';
import type { Campo, SendOutcome } from './store';
import type { CampoLocale } from './texts';
import { currentLocale, setLocale, t } from './texts';
import WizardView from './WizardView.vue';

/**
 * La pantalla de /campo (ADR 0048): el inicio, la ficha en pasos y el detalle
 * de lo enviado. Cuando vuelve la señal (o la persona vuelve a la pantalla),
 * actualiza los estados y envía lo que quedó listo.
 */
const { campo } = defineProps<{ campo: Campo }>();

type View = { name: 'home' } | { name: 'wizard'; uuid: string } | { name: 'detail'; uuid: string };

const view = ref<View>({ name: 'home' });
const locale = ref<CampoLocale>(currentLocale());
const notice = ref('');

function toggleLocale(): void {
    locale.value = locale.value === 'es' ? 'en' : 'es';
    setLocale(locale.value);
}

async function sync(): Promise<void> {
    await campo.refresh();

    if (campo.state.auth === 'ok') {
        await campo.sendPending();
    }
}

function onOnline(): void {
    campo.setOnline(true);
    notice.value = t('online_again');
    void sync();
}

function onOffline(): void {
    campo.setOnline(false);
}

function onVisible(): void {
    if (document.visibilityState === 'visible' && navigator.onLine) {
        void sync();
    }
}

onMounted(async () => {
    await campo.load();
    campo.setOnline(navigator.onLine);

    if (navigator.onLine) {
        await sync();
    }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
});

onBeforeUnmount(() => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
});

function create(): void {
    view.value = { name: 'wizard', uuid: campo.createDraft().uuid };
}

function finished(outcome: SendOutcome | null): void {
    if (outcome?.kind === 'sent') {
        notice.value = t('review.saved_sent');
        view.value = { name: 'detail', uuid: outcome.summary.uuid };

        return;
    }

    notice.value = outcome === null || outcome.kind === 'offline' ? t('review.saved_offline') : t('home.sent_fail');
    view.value = { name: 'home' };
}

function home(): void {
    view.value = { name: 'home' };
}
</script>

<template>
    <div class="shell">
        <header class="bar">
            <h1 class="bar__title">{{ t('title') }}</h1>
            <button type="button" class="btn btn--glass" :aria-label="locale === 'es' ? 'English' : 'Español'" @click="toggleLocale">{{ locale === 'es' ? 'EN' : 'ES' }}</button>
        </header>

        <main class="main">
            <p v-if="!campo.state.online" class="notice" role="status">{{ t('offline') }}</p>
            <p v-if="campo.state.storageKind === 'memory'" class="notice notice--error" role="alert">{{ t('storage_unavailable') }}</p>

            <section v-if="campo.state.auth === 'needed'" class="login" aria-labelledby="campo-login">
                <h2 id="campo-login" class="section-title">{{ t('login.title') }}</h2>
                <p>{{ t('login.body') }}</p>
                <a class="btn btn--primary btn--block" href="/admin/login">{{ t('login.button') }}</a>
                <button type="button" class="btn btn--quiet btn--block" @click="sync">{{ t('login.retry') }}</button>
            </section>

            <p v-if="notice && view.name === 'home'" class="notice" role="status">{{ notice }}</p>

            <template v-if="campo.state.ready">
                <HomeView v-if="view.name === 'home'" :campo="campo" @create="create" @resume="(uuid) => (view = { name: 'wizard', uuid })" @detail="(uuid) => (view = { name: 'detail', uuid })" />
                <WizardView v-else-if="view.name === 'wizard'" :key="view.uuid" :campo="campo" :uuid="view.uuid" @exit="home" @finished="finished" />
                <DetailView v-else :campo="campo" :uuid="view.uuid" @back="home" @correct="(uuid) => (view = { name: 'wizard', uuid })" />
            </template>
            <p v-else role="status">{{ t('loading') }}</p>
        </main>
    </div>
</template>
