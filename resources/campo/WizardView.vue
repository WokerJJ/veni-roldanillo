<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, toRaw } from 'vue';

import type { Draft, Errors } from './draft';
import { firstInvalidStep, STEPS, validateStep } from './draft';
import StepBasics from './steps/StepBasics.vue';
import StepContact from './steps/StepContact.vue';
import StepDuplicates from './steps/StepDuplicates.vue';
import StepHours from './steps/StepHours.vue';
import StepOwner from './steps/StepOwner.vue';
import StepPlace from './steps/StepPlace.vue';
import StepReview from './steps/StepReview.vue';
import type { Campo, SendOutcome } from './store';
import { t } from './texts';

/**
 * La ficha en pasos (ADR 0048). Trabaja sobre una copia del borrador y la
 * guarda en el teléfono en cada cambio (con una espera corta) y en cada paso:
 * cerrar la pantalla o perder la señal no pierde nada. Al terminar queda
 * «lista» y, con señal, se envía en el momento.
 */
const { campo, uuid } = defineProps<{ campo: Campo; uuid: string }>();

const emit = defineEmits<{ exit: []; finished: [outcome: SendOutcome | null] }>();

const source = campo.state.drafts.find((candidate) => candidate.uuid === uuid);
const draft = ref<Draft>(source ? structuredClone(toRaw(source)) : campo.createDraft());
const step = ref(Math.min(draft.value.step, STEPS.length - 1));
const shown = ref(false);
const sending = ref(false);
const heading = ref<HTMLElement | null>(null);

const name = computed(() => STEPS[step.value] ?? 'basics');
const errors = computed<Errors>(() => (shown.value ? validateStep(draft.value, name.value) : {}));
const isLast = computed(() => name.value === 'review');

let timer: ReturnType<typeof setTimeout> | undefined;

function persist(): void {
    clearTimeout(timer);
    void campo.saveDraft({ ...draft.value, step: step.value });
}

function patch(changes: Partial<Draft>): void {
    draft.value = { ...draft.value, ...changes, state: draft.value.state === 'ready' ? 'editing' : draft.value.state };
    clearTimeout(timer);
    timer = setTimeout(persist, 400);
}

onBeforeUnmount(() => {
    persist();
});

async function goTo(index: number): Promise<void> {
    step.value = Math.max(0, Math.min(STEPS.length - 1, index));
    shown.value = false;
    persist();
    await nextTick();
    heading.value?.focus();
    window.scrollTo({ top: 0 });
}

async function next(): Promise<void> {
    if (Object.keys(validateStep(draft.value, name.value)).length > 0) {
        shown.value = true;

        return;
    }

    await goTo(step.value + 1);
}

async function finish(): Promise<void> {
    const invalid = firstInvalidStep(draft.value);

    if (invalid !== null) {
        await goTo(STEPS.indexOf(invalid));
        shown.value = true;

        return;
    }

    sending.value = true;
    draft.value = { ...draft.value, state: 'ready', serverErrors: [], step: step.value };
    await campo.saveDraft(draft.value);
    const outcome = campo.state.online ? await campo.sendDraft(uuid) : null;
    sending.value = false;
    emit('finished', outcome);
}

function check(): ReturnType<Campo['checkDuplicates']> {
    return campo.checkDuplicates(draft.value);
}

function leave(): void {
    persist();
    emit('exit');
}
</script>

<template>
    <section class="wizard" :aria-labelledby="'campo-step-title'">
        <header class="wizard__head">
            <button type="button" class="btn btn--quiet" @click="leave">← {{ t('back') }}</button>
            <p class="wizard__count">{{ t('home.step_of', { n: step + 1, total: STEPS.length }) }}</p>
        </header>
        <progress class="wizard__progress" :max="STEPS.length" :value="step + 1" :aria-label="t('home.step_of', { n: step + 1, total: STEPS.length })" />

        <h2 id="campo-step-title" ref="heading" class="wizard__title" tabindex="-1">{{ t(`steps.${name}`) }}</h2>

        <p v-if="draft.serverErrors.length > 0" class="notice notice--error" role="alert">
            {{ draft.serverErrors.includes('conflict') ? t('errors.conflict') : t('errors.server') }}
        </p>
        <p v-if="shown && Object.keys(errors).length > 0" class="notice notice--error" role="alert">{{ t('steps.fix') }}</p>

        <StepBasics v-if="name === 'basics'" :draft="draft" :errors="errors" :meta="campo.state.meta" :patch="patch" />
        <StepPlace v-else-if="name === 'place'" :draft="draft" :errors="errors" :patch="patch" />
        <StepDuplicates v-else-if="name === 'duplicates'" :draft="draft" :errors="errors" :online="campo.state.online" :check="check" :patch="patch" />
        <StepContact v-else-if="name === 'contact'" :draft="draft" :errors="errors" :meta="campo.state.meta" :patch="patch" />
        <StepHours v-else-if="name === 'hours'" :draft="draft" :errors="errors" :patch="patch" />
        <StepOwner v-else-if="name === 'owner'" :draft="draft" :errors="errors" :patch="patch" />
        <StepReview v-else :draft="draft" :meta="campo.state.meta" @goto="goTo" />

        <nav class="wizard__nav" :aria-label="t('title')">
            <button type="button" class="btn btn--quiet" :disabled="step === 0 || sending" @click="goTo(step - 1)">{{ t('steps.previous') }}</button>
            <button v-if="!isLast" type="button" class="btn btn--primary" @click="next">{{ t('steps.next') }}</button>
            <button v-else type="button" class="btn btn--primary" :disabled="sending" @click="finish">
                {{ sending ? t('home.sending') : campo.state.online ? t('review.save') : t('review.save_offline') }}
            </button>
        </nav>
    </section>
</template>
