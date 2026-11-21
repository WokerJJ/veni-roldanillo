<script setup lang="ts">
import type { Draft, StepName } from '../draft';
import { dishCount, STEPS, unpricedCount } from '../draft';
import type { MetaCache } from '../storage';
import { currentLocale, list, t } from '../texts';

/** Paso 7: lo capturado, con un «Cambiar» por bloque, antes de guardarlo. */
const { draft, meta } = defineProps<{
    draft: Draft;
    meta: MetaCache | null;
}>();

const emit = defineEmits<{ goto: [index: number] }>();

function categories(): string {
    return (meta?.categories ?? [])
        .filter((category) => draft.categoryIds.includes(category.id))
        .map((category) => (currentLocale() === 'en' ? category.name_en : category.name_es))
        .join(', ');
}

function hoursLines(): string[] {
    const days = list('days');

    return [1, 2, 3, 4, 5, 6, 0]
        .map((weekday) => {
            const slots = draft.hours.filter((slot) => slot.weekday === weekday).map((slot) => `${slot.opens}–${slot.closes}`);

            return `${days[weekday] ?? String(weekday)}: ${slots.length > 0 ? slots.join(', ') : t('hours.closed')}`;
        });
}

function go(step: StepName): void {
    emit('goto', STEPS.indexOf(step));
}
</script>

<template>
    <div class="step">
        <h3 class="step__title">{{ t('review.title') }}</h3>
        <p v-if="draft.returnNote" class="notice" role="note"><strong>{{ t('detail.returned_note') }}</strong> {{ draft.returnNote }}</p>
        <p v-if="draft.duplicates === null" class="notice" role="note">{{ t('review.unchecked') }}</p>

        <section class="summary">
            <div class="summary__head"><h4>{{ t('steps.basics') }}</h4><button type="button" class="btn btn--quiet" @click="go('basics')">{{ t('review.edit') }}</button></div>
            <p class="summary__big">{{ draft.name }}</p>
            <p>{{ categories() }}</p>
        </section>

        <section class="summary">
            <div class="summary__head"><h4>{{ t('steps.place') }}</h4><button type="button" class="btn btn--quiet" @click="go('place')">{{ t('review.edit') }}</button></div>
            <p>{{ draft.address }}<template v-if="draft.reference"> · {{ draft.reference }}</template></p>
            <p v-if="draft.latitude !== null && draft.longitude !== null">{{ t('pin.taken', { lat: String(draft.latitude), lng: String(draft.longitude) }) }}</p>
            <p v-if="draft.restaurantId !== null">{{ t('duplicates.completing') }}</p>
        </section>

        <section class="summary">
            <div class="summary__head"><h4>{{ t('steps.contact') }}</h4><button type="button" class="btn btn--quiet" @click="go('contact')">{{ t('review.edit') }}</button></div>
            <p v-if="draft.whatsapp">{{ t('fields.whatsapp') }}: {{ draft.whatsapp }}</p>
            <p v-if="draft.phone">{{ t('fields.phone') }}: {{ draft.phone }}</p>
            <p>{{ t('fields.delivery') }} {{ draft.delivery ? t('fields.yes') : t('fields.no') }}</p>
            <p v-if="draft.paymentMethods.length > 0">{{ draft.paymentMethods.map((method) => t(`payment.${method}`)).join(', ') }}</p>
        </section>

        <section class="summary">
            <div class="summary__head"><h4>{{ t('steps.hours') }}</h4><button type="button" class="btn btn--quiet" @click="go('hours')">{{ t('review.edit') }}</button></div>
            <p v-for="line in hoursLines()" :key="line">{{ line }}</p>
        </section>

        <section class="summary">
            <div class="summary__head"><h4>{{ t('steps.menu') }}</h4><button type="button" class="btn btn--quiet" @click="go('menu')">{{ t('review.edit') }}</button></div>
            <p v-if="draft.menu.length === 0">{{ t('review.no_menu') }}</p>
            <template v-else>
                <p>{{ t('menu.count', { dishes: dishCount(draft.menu), sections: draft.menu.length }) }}</p>
                <ul class="summary__list">
                    <li v-for="(section, index) in draft.menu" :key="index">{{ section.name_es || t('menu.section_name') }}: {{ section.dishes.length }}</li>
                </ul>
                <div v-if="unpricedCount(draft.menu) > 0" class="notice" role="note">
                    <p>{{ t('review.unpriced', { n: unpricedCount(draft.menu) }) }}</p>
                    <button type="button" class="btn btn--tonal" @click="go('menu')">{{ t('review.fix_prices') }}</button>
                </div>
                <p v-if="draft.menu.some((section) => section.dishes.some((dish) => dish.is_alcohol))" class="muted">{{ t('menu.alcohol_review') }}</p>
            </template>
        </section>

        <section class="summary">
            <div class="summary__head"><h4>{{ t('steps.owner') }}</h4><button type="button" class="btn btn--quiet" @click="go('owner')">{{ t('review.edit') }}</button></div>
            <p>{{ draft.ownerName }} · {{ t(`fields.owner_role_${draft.ownerRole}`) }}</p>
            <p>{{ draft.ownerPhone }}</p>
        </section>
    </div>
</template>
