<script setup lang="ts">
import { computed, useId } from 'vue';

import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import { formatDay } from '@/i18n/intl';
import type { WeeklyHours } from '@/restaurants/openStatus';
import { businessDay } from '@/restaurants/openStatus';
import type { ProfileSpecialHours } from '@/restaurants/profile';
import type { Slot } from '@/restaurants/schedule';
import { upcomingSpecialDays, weekSchedule } from '@/restaurants/schedule';
import { formatClock, weekdayName } from '@/restaurants/statusText';

/**
 * El horario de un restaurante en su ficha (#13): la semana, de lunes a
 * domingo, con el día de hoy resaltado, y los horarios especiales que vienen
 * (un festivo, un cierre). «Hoy» es el día en Colombia, esté donde esté el
 * teléfono, y se pone al día solo si la página queda abierta hasta la
 * medianoche.
 *
 * Si hoy tiene un horario especial, la fila de hoy muestra ese: es el que
 * vale, y es el mismo con que se calcula «abierto ahora» (openStatus.ts).
 * Sin horario cargado lo dice, en vez de dejar una tabla de siete «Cerrado».
 */
const { hours, specialHours } = defineProps<{
    hours: readonly WeeklyHours[];
    specialHours: readonly ProfileSpecialHours[];
}>();

const { t, locale } = useI18n();
const now = useNow();
const headingId = useId();

const today = computed(() => businessDay(now.value));
const special = computed(() => upcomingSpecialDays(specialHours, today.value.date));

const week = computed(() => {
    const override = special.value.find(({ date }) => date === today.value.date);

    return weekSchedule(hours).map((day) => {
        const isToday = day.weekday === today.value.weekday;

        return { ...day, today: isToday, slots: isToday && override ? override.slots : day.slots };
    });
});

function range({ opens, closes }: Slot): string {
    return t('restaurant.hours.range', { opens: formatClock(opens, locale.value), closes: formatClock(closes, locale.value) });
}
</script>

<template>
    <section :aria-labelledby="headingId">
        <h2 :id="headingId" class="text-xl">{{ t('restaurant.hours.title') }}</h2>

        <p v-if="hours.length === 0" class="mt-2 text-ink-muted" data-empty>{{ t('restaurant.hours.empty') }}</p>

        <table v-else class="mt-2 w-full max-w-md border-separate border-spacing-0" :aria-labelledby="headingId">
            <tbody>
                <tr v-for="day in week" :key="day.weekday" :aria-current="day.today ? 'date' : undefined" :class="{ 'bg-surface': day.today }">
                    <th scope="row" class="rounded-l-veni-sm px-3 py-2 text-left align-top" :class="day.today ? 'font-semibold' : 'font-normal'">
                        <span class="inline-block first-letter:uppercase">{{ weekdayName(day.weekday, locale) }}</span>
                        <span
                            v-if="day.today"
                            class="ml-2 inline-block rounded-full bg-veni-ciruela px-2 py-0.5 text-xs font-semibold text-veni-blanco dark:bg-veni-mango dark:text-veni-ciruela"
                            data-today
                        >
                            {{ t('restaurant.hours.today') }}
                        </span>
                    </th>
                    <td class="rounded-r-veni-sm px-3 py-2 text-right align-top tabular-nums" :class="{ 'font-semibold': day.today }">
                        <template v-if="day.slots.length > 0">
                            <span v-for="slot in day.slots" :key="slot.opens" class="block">{{ range(slot) }}</span>
                        </template>
                        <span v-else class="text-ink-muted">{{ t('restaurant.hours.closed') }}</span>
                    </td>
                </tr>
            </tbody>
        </table>

        <template v-if="special.length > 0">
            <h3 class="mt-5 text-base">{{ t('restaurant.special_hours.title') }}</h3>

            <ul class="mt-1 max-w-md" data-special>
                <li v-for="day in special" :key="day.date" class="flex justify-between gap-4 border-t border-line px-3 py-2 first:border-t-0">
                    <span>
                        <span class="block first-letter:uppercase" data-date>{{ formatDay(day.date, locale) }}</span>
                        <span v-if="day.note" class="block text-sm text-ink-muted" data-note>{{ day.note }}</span>
                    </span>
                    <span class="shrink-0 text-right tabular-nums" data-hours>
                        <template v-if="!day.closed">
                            <span v-for="slot in day.slots" :key="slot.opens" class="block">{{ range(slot) }}</span>
                        </template>
                        <span v-else class="text-ink-muted">{{ t('restaurant.hours.closed') }}</span>
                    </span>
                </li>
            </ul>
        </template>
    </section>
</template>
