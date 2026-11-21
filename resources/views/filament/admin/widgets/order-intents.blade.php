{{-- Toques en «Enviar pedido por WhatsApp» (Escritorio de administración,
     ADR 0050): tarjetas y tablas con barras, sin librerías de gráficos. Con
     pocos toques se muestran los números tal cual, sin porcentajes. --}}
@php
    $stats = $this->stats();
    $days = $stats->days;
    $ranking = $this->ranking();
    $peak = $stats->peak();
    $rankPeak = max(1, ...array_map(fn (object $row) => $row->current, $ranking) ?: [1]);
    $changeText = match (true) {
        $stats->previous === 0 && $stats->current === 0 => __('panel.admin.dashboard.clicks.change_none', ['days' => $days]),
        ! $stats->percentIsMeaningful() => __('panel.admin.dashboard.clicks.change_few', ['previous' => $stats->previous, 'days' => $days]),
        ($stats->change() ?? 0) > 0 => __('panel.stats.change_up', ['percent' => $stats->change(), 'days' => $days]),
        ($stats->change() ?? 0) < 0 => __('panel.stats.change_down', ['percent' => abs((int) $stats->change()), 'days' => $days]),
        default => __('panel.stats.change_same', ['days' => $days]),
    };
    // Texto atenuado: 75 % del color del texto (≈ 7:1 en claro y oscuro).
    $muted = 'color: color-mix(in oklab, currentColor 75%, transparent)';
    $divider = 'border-top: 1px solid color-mix(in oklab, var(--gray-500) 25%, transparent)';
    $sr = 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0';
@endphp

<x-filament-widgets::widget>
    <x-filament::section :heading="__('panel.admin.dashboard.clicks.heading')">
        <p style="{{ $muted }}; margin: 0 0 1rem">{{ __('panel.admin.dashboard.clicks.intro') }}</p>

        <div role="group" aria-label="{{ __('panel.stats.period') }}" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem">
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

        <div style="display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); margin-bottom: 2rem">
            <div style="padding: 1rem; border: 1px solid color-mix(in oklab, var(--gray-500) 30%, transparent); border-radius: 0.5rem">
                <p style="{{ $muted }}; font-size: 0.875rem; line-height: 1.25rem; margin: 0">{{ __('panel.stats.current', ['days' => $days]) }}</p>
                <p style="font-size: 1.875rem; line-height: 2.25rem; font-weight: 600; font-variant-numeric: tabular-nums; margin: 0.25rem 0 0" data-stat="current">{{ $stats->current }}</p>
                <p style="{{ $muted }}; font-size: 0.875rem; line-height: 1.25rem; margin: 0.25rem 0 0" data-stat="change" aria-live="polite">{{ $changeText }}</p>
            </div>
            <div style="padding: 1rem; border: 1px solid color-mix(in oklab, var(--gray-500) 30%, transparent); border-radius: 0.5rem">
                <p style="{{ $muted }}; font-size: 0.875rem; line-height: 1.25rem; margin: 0">{{ __('panel.stats.previous', ['days' => $days]) }}</p>
                <p style="font-size: 1.875rem; line-height: 2.25rem; font-weight: 600; font-variant-numeric: tabular-nums; margin: 0.25rem 0 0" data-stat="previous">{{ $stats->previous }}</p>
            </div>
        </div>

        <div style="display: grid; gap: 2rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr))">
            <div>
                <h3 style="font-size: 0.875rem; line-height: 1.25rem; font-weight: 600; margin: 0 0 0.5rem">{{ __('panel.stats.per_day') }}</h3>
                <div style="overflow-x: auto" tabindex="0" role="region" aria-label="{{ __('panel.stats.per_day') }}">
                <table style="width: 100%; min-width: 16rem; border-collapse: collapse; font-size: 0.875rem; line-height: 1.25rem">
                    <caption style="{{ $sr }}">{{ __('panel.stats.per_day') }}</caption>
                    <thead>
                        <tr style="{{ $muted }}">
                            <th scope="col" style="padding: 0.5rem 1rem 0.5rem 0; text-align: start; font-weight: 500">{{ __('panel.stats.day') }}</th>
                            <th scope="col" style="padding: 0.5rem 0; text-align: start; font-weight: 500">{{ __('panel.stats.clicks') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach (array_reverse($stats->perDay, true) as $date => $count)
                            <tr data-day="{{ $date }}" style="{{ $divider }}">
                                <th scope="row" style="padding: 0.5rem 1rem 0.5rem 0; text-align: start; font-weight: 400; white-space: nowrap">
                                    {{ \Carbon\CarbonImmutable::parse($date)->locale(app()->getLocale())->isoFormat('ddd D MMM') }}
                                </th>
                                <td style="padding: 0.5rem 0; width: 100%">
                                    <span style="display: flex; align-items: center; gap: 0.75rem">
                                        <span style="min-width: 2ch; text-align: end; font-variant-numeric: tabular-nums">{{ $count }}</span>
                                        <span aria-hidden="true" style="display: block; height: 0.5rem; border-radius: 9999px; background: var(--primary-500); width: {{ (int) round($count * 100 / $peak) }}%"></span>
                                    </span>
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
                </div>
            </div>

            <div>
                <h3 style="font-size: 0.875rem; line-height: 1.25rem; font-weight: 600; margin: 0 0 0.5rem">{{ __('panel.admin.dashboard.clicks.ranking') }}</h3>
                @if ($ranking === [])
                    <p style="{{ $muted }}; margin: 0" data-empty>{{ __('panel.admin.dashboard.clicks.empty', ['days' => $days]) }}</p>
                @else
                    <div style="overflow-x: auto" tabindex="0" role="region" aria-label="{{ __('panel.admin.dashboard.clicks.ranking') }}">
                    <table style="width: 100%; min-width: 17rem; border-collapse: collapse; font-size: 0.875rem; line-height: 1.25rem">
                        <caption style="{{ $sr }}">{{ __('panel.admin.dashboard.clicks.ranking') }}</caption>
                        <thead>
                            <tr style="{{ $muted }}">
                                <th scope="col" style="padding: 0.5rem 1rem 0.5rem 0; text-align: start; font-weight: 500">{{ __('panel.admin.dashboard.freshness.restaurant') }}</th>
                                <th scope="col" style="padding: 0.5rem 1rem 0.5rem 0; text-align: start; font-weight: 500">{{ __('panel.stats.clicks') }}</th>
                                <th scope="col" style="padding: 0.5rem 0; text-align: end; font-weight: 500">{{ __('panel.admin.dashboard.clicks.before') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach ($ranking as $row)
                                @php($url = $this->restaurantUrl($row->id))
                                <tr data-restaurant="{{ $row->id }}" style="{{ $divider }}">
                                    <th scope="row" style="padding: 0.5rem 1rem 0.5rem 0; text-align: start; font-weight: 400">
                                        @if ($url)
                                            <a href="{{ $url }}" style="text-decoration: underline; text-underline-offset: 0.2em">{{ $row->name }}</a>
                                        @else
                                            {{ $row->name }}
                                        @endif
                                    </th>
                                    <td style="padding: 0.5rem 1rem 0.5rem 0; width: 50%">
                                        <span style="display: flex; align-items: center; gap: 0.75rem">
                                            <span style="min-width: 2ch; text-align: end; font-variant-numeric: tabular-nums">{{ $row->current }}</span>
                                            <span aria-hidden="true" style="display: block; height: 0.5rem; border-radius: 9999px; background: var(--primary-500); width: {{ (int) round($row->current * 100 / $rankPeak) }}%"></span>
                                        </span>
                                    </td>
                                    <td style="padding: 0.5rem 0; text-align: end; font-variant-numeric: tabular-nums">{{ $row->previous }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                    </div>
                @endif
            </div>
        </div>

        <p style="{{ $muted }}; font-size: 0.75rem; line-height: 1rem; margin: 1.5rem 0 0">{{ __('panel.admin.dashboard.clicks.note', ['months' => \App\Models\OrderIntent::RETENTION_MONTHS]) }}</p>
    </x-filament::section>
</x-filament-widgets::widget>
