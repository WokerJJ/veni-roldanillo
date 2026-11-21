<script setup lang="ts">
import CloseIcon from '../components/CloseIcon.vue';
import type { Draft, Errors, HourSlot } from '../draft';
import { list, t } from '../texts';

/**
 * Paso 5: el horario semanal, por día y con varias franjas si hace falta.
 * Un día sin franjas es un día cerrado. Si cierra después de medianoche se
 * escribe la hora real de cierre: la franja termina al día siguiente.
 */
const { draft, errors, patch } = defineProps<{
    draft: Draft;
    errors: Errors;
    patch: (changes: Partial<Draft>) => void;
}>();

/** De lunes a domingo, como se lee en Colombia (0 es domingo en los datos). */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function dayName(weekday: number): string {
    return list('days')[weekday] ?? String(weekday);
}

function slotsOf(weekday: number): { slot: HourSlot; index: number }[] {
    return draft.hours.map((slot, index) => ({ slot, index })).filter((item) => item.slot.weekday === weekday);
}

function add(weekday: number): void {
    const last = slotsOf(weekday).at(-1)?.slot;

    patch({ hours: [...draft.hours, { weekday, opens: last ? last.closes : '11:00', closes: last ? '23:00' : '15:00' }] });
}

function remove(index: number): void {
    patch({ hours: draft.hours.filter((_, current) => current !== index) });
}

function change(index: number, field: 'opens' | 'closes', value: string): void {
    patch({ hours: draft.hours.map((slot, current) => (current === index ? { ...slot, [field]: value } : slot)) });
}

/** Las franjas de ese día se repiten en todos los demás. */
function copyToOthers(weekday: number): void {
    const source = slotsOf(weekday).map((item) => item.slot);

    patch({ hours: WEEK.flatMap((day) => source.map((slot) => ({ ...slot, weekday: day }))) });
}
</script>

<template>
    <div class="step">
        <p class="field__help">{{ t('hours.help') }}</p>
        <p v-if="errors.hours" class="field__error" role="alert">{{ t(`errors.${errors.hours}`) }}</p>

        <section v-for="weekday in WEEK" :key="weekday" class="day" :aria-labelledby="`campo-day-${String(weekday)}`">
            <h3 :id="`campo-day-${String(weekday)}`" class="day__name">{{ dayName(weekday) }}</h3>

            <p v-if="slotsOf(weekday).length === 0" class="day__closed">{{ t('hours.closed') }}</p>

            <div v-for="item in slotsOf(weekday)" :key="item.index" class="slot">
                <label class="slot__time">
                    <span>{{ t('hours.opens') }}</span>
                    <input class="input" type="time" :value="item.slot.opens" @input="(event) => change(item.index, 'opens', (event.target as HTMLInputElement).value)">
                </label>
                <label class="slot__time">
                    <span>{{ t('hours.closes') }}</span>
                    <input class="input" type="time" :value="item.slot.closes" @input="(event) => change(item.index, 'closes', (event.target as HTMLInputElement).value)">
                </label>
                <button type="button" class="btn btn--quiet slot__remove" :aria-label="t('hours.remove', { day: dayName(weekday) })" @click="remove(item.index)"><CloseIcon /></button>
            </div>

            <div class="day__actions">
                <button type="button" class="btn btn--quiet" @click="add(weekday)">+ {{ t('hours.add') }}</button>
                <button v-if="slotsOf(weekday).length > 0" type="button" class="btn btn--quiet" @click="copyToOthers(weekday)">{{ t('hours.copy') }}</button>
            </div>
        </section>
    </div>
</template>
