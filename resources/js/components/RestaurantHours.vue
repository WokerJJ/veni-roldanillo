<script setup lang="ts">
import { computed, useId } from 'vue';

import Icon from '@/components/Icon.vue';
import { useI18n } from '@/composables/useI18n';
import { useNow } from '@/composables/useNow';
import { formatDay } from '@/i18n/intl';
import type { WeeklyHours } from '@/restaurants/openStatus';
import { serviceDay } from '@/restaurants/openStatus';
import type { ProfileSpecialHours } from '@/restaurants/profile';
import type { Slot } from '@/restaurants/schedule';
import { upcomingSpecialDays, weekSchedule } from '@/restaurants/schedule';
import { formatClock } from '@/restaurants/statusText';
import type { DayGroup } from '@/restaurants/weekGroups';
import { groupWeek, longGroupNames, shortGroupLabel } from '@/restaurants/weekGroups';

/**
 * El horario de un restaurante en su ficha, compacto (#125, #82, ADR 0038):
 * a la vista, solo el de hoy; la semana, con los días iguales juntos
 * («Lun–Sáb», «Dom»), y los horarios especiales que vienen (un festivo, un
 * cierre) se despliegan con «Ver semana» (un `<details>`: el navegador dice
 * si está abierto o cerrado y se abre con el teclado). «Hoy» es el día en
 * Colombia, esté donde esté el teléfono, y se pone al día solo si la página
 * queda abierta hasta la medianoche.
 *
 * Si hoy tiene un horario especial, la línea de hoy muestra ese, con su nota:
 * es el que vale, y es el mismo con que se calcula «abierto ahora»
 * (openStatus.ts). Pasada la medianoche, mientras sigue abierto el turno de
 * anoche, «hoy» es el día de ese turno (serviceDay, BUG-034): la línea no
 * dice «Cerrado» mientras el estado dice «Abierto». Sin horario cargado lo
 * dice, en vez de una semana entera de «Cerrado».
 *
 * El slot va justo después del título: la ficha pone ahí el estado («Abierto
 * ahora · cierra a las…»), que es parte del horario (EVA-039).
 */
const { hours, specialHours } = defineProps<{
    hours: readonly WeeklyHours[];
    specialHours: readonly ProfileSpecialHours[];
}>();

const { t, locale } = useI18n();
const now = useNow();
const headingId = useId();

const today = computed(() => serviceDay({ hours, special_hours: specialHours }, now.value));
const special = computed(() => upcomingSpecialDays(specialHours, today.value.date));
const todaySpecial = computed(() => special.value.find(({ date }) => date === today.value.date));
/** Los que vienen después de hoy: el de hoy ya está en la línea de hoy. */
const laterSpecial = computed(() => special.value.filter(({ date }) => date !== today.value.date));

const week = computed(() => weekSchedule(hours));
const groups = computed(() => groupWeek(week.value));

/** Lo que vale hoy: el horario especial, si hay, o el de la semana. */
const todaySlots = computed(() => todaySpecial.value?.slots ?? week.value.find(({ weekday }) => weekday === today.value.weekday)?.slots ?? []);
/** Sin horario de la semana ni especial de hoy no hay línea de hoy: no se sabe. */
const knowsToday = computed(() => hours.length > 0 || todaySpecial.value !== undefined);

function range({ opens, closes }: Slot): string {
    return t('restaurant.hours.range', { opens: formatClock(opens, locale.value), closes: formatClock(closes, locale.value) });
}

/** «lunes a sábado», «domingo»: lo que oye el lector en vez de «Lun–Sáb». */
function spokenGroup(group: DayGroup): string {
    const { from, to } = longGroupNames(group, locale.value);

    return to === null ? from : t('restaurant.hours.days_range', { from, to });
}
</script>

<template>
    <section :aria-labelledby="headingId">
        <h2 :id="headingId" class="sr-only">{{ t('restaurant.hours.title') }}</h2>

        <slot />

        <p v-if="knowsToday" class="tabular-nums" data-today>
            <span class="font-semibold">{{ t('restaurant.hours.today') }}</span>
            {{ ' ' }}
            <span v-if="todaySlots.length === 0">{{ t('restaurant.hours.closed') }}</span>
            <template v-for="(slot, index) in todaySlots" :key="slot.opens">
                <span v-if="index > 0" aria-hidden="true"> · </span>
                <span class="whitespace-nowrap">{{ range(slot) }}</span>
            </template>
            <span v-if="todaySpecial?.note" class="text-ink-muted" data-today-note> · {{ todaySpecial.note }}</span>
        </p>

        <p v-if="hours.length === 0" class="text-ink-muted" :class="{ 'mt-1': knowsToday }" data-empty>{{ t('restaurant.hours.empty') }}</p>

        <details v-if="hours.length > 0 || laterSpecial.length > 0" class="week" data-week>
            <summary class="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-full px-2 font-semibold underline underline-offset-4 hover:bg-surface">
                <Icon name="chevron-derecha" :size="20" class="week-marker shrink-0" />
                {{ laterSpecial.length > 0 ? t('restaurant.hours.see_week_special') : t('restaurant.hours.see_week') }}
            </summary>

            <table v-if="hours.length > 0" class="w-full border-separate border-spacing-0" :aria-labelledby="headingId">
                <tbody>
                    <tr v-for="group in groups" :key="group.from" class="align-top">
                        <th scope="row" class="py-1 pr-4 text-left font-normal">
                            <span aria-hidden="true" data-days>{{ shortGroupLabel(group, locale) }}</span>
                            <span class="sr-only">{{ spokenGroup(group) }}</span>
                        </th>
                        <td class="py-1 text-right tabular-nums">
                            <template v-if="group.slots.length > 0">
                                <span v-for="slot in group.slots" :key="slot.opens" class="block">{{ range(slot) }}</span>
                            </template>
                            <span v-else class="text-ink-muted">{{ t('restaurant.hours.closed') }}</span>
                        </td>
                    </tr>
                </tbody>
            </table>

            <template v-if="laterSpecial.length > 0">
                <h3 class="mt-3 text-base">{{ t('restaurant.special_hours.title') }}</h3>

                <ul class="mt-1" data-special>
                    <li v-for="day in laterSpecial" :key="day.date" class="flex justify-between gap-4 border-t border-line py-2 first:border-t-0">
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
        </details>
    </section>
</template>

<style scoped>
/*
 * El triángulo del navegador se cambia por el chevron de la marca, que apunta
 * abajo al abrir (sin animación). CSS propio de la ficha, no utilidades
 * nuevas de Tailwind: el CSS de Tailwind baja con el arranque (ADR 0020).
 */
.week > summary {
    list-style: none;
    cursor: pointer;
}

.week > summary::-webkit-details-marker {
    display: none;
}

.week[open] .week-marker {
    rotate: 90deg;
}
</style>
