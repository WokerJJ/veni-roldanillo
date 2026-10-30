{{-- Estadísticas del dueño (#22, ADR 0031). Sin gráficos de JavaScript:
     tarjetas y una tabla con barras de ancho fijo, que se leen igual con un
     lector de pantalla. --}}
@php
    $stats = $this->stats();
    $days = $stats->days;
    $change = $stats->change();
    $changeText = match (true) {
        $change === null => __('panel.stats.change_none', ['days' => $days]),
        $change > 0 => __('panel.stats.change_up', ['percent' => $change, 'days' => $days]),
        $change < 0 => __('panel.stats.change_down', ['percent' => abs($change), 'days' => $days]),
        default => __('panel.stats.change_same', ['days' => $days]),
    };
    $peak = $stats->peak();
@endphp

<x-filament-panels::page>
    {{-- Sin tema propio de Filament, las clases de Tailwind de esta vista no
         se compilan: el diseño va con estilos en línea (style-src-attr del
         perfil «panel», ADR 0025) y las variables de color de Filament. --}}
    <p style="color: var(--gray-500)">{{ __('panel.stats.intro') }}</p>

    <div role="group" aria-label="{{ __('panel.stats.period') }}" style="display: flex; flex-wrap: wrap; gap: 0.5rem">
        @foreach (\App\Support\OrderIntentStats::PERIODS as $option)
            <x-filament::button
                :color="$option === $days ? 'primary' : 'gray'"
                :outlined="$option !== $days"
                wire:click="setPeriod({{ $option }})"
                aria-pressed="{{ $option === $days ? 'true' : 'false' }}"
                data-period="{{ $option }}"
            >
                {{ __('panel.stats.last_days', ['days' => $option]) }}
            </x-filament::button>
        @endforeach
    </div>

    <div style="display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr))">
        <x-filament::section>
            <p style="color: var(--gray-500)">{{ __('panel.stats.current', ['days' => $days]) }}</p>
            <p style="font-size: 1.875rem; font-weight: 600; font-variant-numeric: tabular-nums" data-stat="current">{{ $stats->current }}</p>
            <p style="color: var(--gray-500); margin-top: 0.25rem" data-stat="change">{{ $changeText }}</p>
        </x-filament::section>
        <x-filament::section>
            <p style="color: var(--gray-500)">{{ __('panel.stats.previous', ['days' => $days]) }}</p>
            <p style="font-size: 1.875rem; font-weight: 600; font-variant-numeric: tabular-nums" data-stat="previous">{{ $stats->previous }}</p>
        </x-filament::section>
        <x-filament::section>
            <dl style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem">
                <div>
                    <dt style="color: var(--gray-500)">{{ __('panel.stats.delivery') }}</dt>
                    <dd style="font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums" data-stat="delivery">{{ $stats->delivery }}</dd>
                </div>
                <div>
                    <dt style="color: var(--gray-500)">{{ __('panel.stats.pickup') }}</dt>
                    <dd style="font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums" data-stat="pickup">{{ $stats->pickup }}</dd>
                </div>
            </dl>
        </x-filament::section>
    </div>

    <x-filament::section :heading="__('panel.stats.per_day')">
        <table style="width: 100%; border-collapse: collapse">
            <thead>
                <tr style="color: var(--gray-500); text-align: start">
                    <th scope="col" style="padding: 0.25rem 1rem 0.25rem 0; text-align: start; font-weight: 500">{{ __('panel.stats.day') }}</th>
                    <th scope="col" style="padding: 0.25rem 0; text-align: start; font-weight: 500">{{ __('panel.stats.clicks') }}</th>
                </tr>
            </thead>
            <tbody>
                @foreach (array_reverse($stats->perDay, true) as $date => $count)
                    <tr style="border-top: 1px solid color-mix(in oklab, var(--gray-500) 20%, transparent)" data-day="{{ $date }}">
                        <th scope="row" style="padding: 0.25rem 1rem 0.25rem 0; text-align: start; font-weight: 400; white-space: nowrap">
                            {{ \Carbon\CarbonImmutable::parse($date)->locale(app()->getLocale())->isoFormat('ddd D MMM') }}
                        </th>
                        <td style="padding: 0.25rem 0; width: 100%">
                            <span style="display: flex; align-items: center; gap: 0.75rem">
                                <span style="min-width: 2ch; text-align: end; font-variant-numeric: tabular-nums">{{ $count }}</span>
                                <span aria-hidden="true" style="display: block; height: 0.5rem; border-radius: 9999px; background: var(--primary-500); width: {{ (int) round($count * 100 / $peak) }}%"></span>
                            </span>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </x-filament::section>

    <p style="color: var(--gray-500); font-size: 0.75rem">{{ __('panel.stats.retention', ['months' => $this->retentionMonths()]) }}</p>
</x-filament-panels::page>
