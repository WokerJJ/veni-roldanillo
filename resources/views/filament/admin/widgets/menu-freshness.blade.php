{{-- Frescura de los menús (Escritorio de administración, ADR 0050). Una
     tabla simple, legible con lector de pantalla; el estado va en texto, no
     solo en color. --}}
@php
    $freshness = $this->freshness();
    $stale = \App\Filament\Admin\Widgets\MenuFreshnessWidget::STALE_DAYS;
    $locale = app()->getLocale();
    // Texto atenuado: 75 % del color del texto (≈ 7:1 en claro y oscuro).
    $muted = 'color: color-mix(in oklab, currentColor 75%, transparent)';
    $divider = 'border-top: 1px solid color-mix(in oklab, var(--gray-500) 25%, transparent)';
@endphp

<x-filament-widgets::widget>
    <x-filament::section :heading="__('panel.admin.dashboard.freshness.heading')" :description="__('panel.admin.dashboard.freshness.intro')">
        @if ($freshness['total'] === 0)
            <p style="{{ $muted }}; margin: 0" data-empty>{{ __('panel.admin.dashboard.freshness.empty') }}</p>
        @else
            <p data-summary style="margin: 0 0 1rem; font-weight: 500">{{ __('panel.admin.dashboard.freshness.summary', ['stale' => $freshness['stale'], 'total' => $freshness['total'], 'days' => $stale]) }}</p>
            <div style="overflow-x: auto" tabindex="0" role="region" aria-label="{{ __('panel.admin.dashboard.freshness.heading') }}">
                <table style="width: 100%; min-width: 24rem; border-collapse: collapse; font-size: 0.875rem; line-height: 1.25rem">
                    <caption style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0">{{ __('panel.admin.dashboard.freshness.heading') }}</caption>
                    <thead>
                        <tr style="text-align: start; {{ $muted }}">
                            <th scope="col" style="padding: 0.5rem 1rem 0.5rem 0; text-align: start; font-weight: 500">{{ __('panel.admin.dashboard.freshness.restaurant') }}</th>
                            <th scope="col" style="padding: 0.5rem 1rem 0.5rem 0; text-align: start; font-weight: 500">{{ __('panel.admin.dashboard.freshness.last') }}</th>
                            <th scope="col" style="padding: 0.5rem 0; text-align: start; font-weight: 500">{{ __('panel.admin.dashboard.freshness.since') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($freshness['rows'] as $row)
                            @php($url = $this->restaurantUrl($row->id))
                            <tr data-restaurant="{{ $row->id }}" style="{{ $divider }}">
                                <th scope="row" style="padding: 0.625rem 1rem 0.625rem 0; text-align: start; font-weight: 400">
                                    @if ($url)
                                        <a href="{{ $url }}" style="text-decoration: underline; text-underline-offset: 0.2em">{{ $row->name }}</a>
                                    @else
                                        {{ $row->name }}
                                    @endif
                                    @if ($row->fictitious)
                                        <span style="{{ $muted }}; font-size: 0.75rem">({{ __('panel.admin.dashboard.freshness.example') }})</span>
                                    @endif
                                </th>
                                <td style="padding: 0.625rem 1rem 0.625rem 0; white-space: nowrap; font-variant-numeric: tabular-nums">
                                    {{ $row->last_at?->locale($locale)->isoFormat('D MMM YYYY') ?? '—' }}
                                </td>
                                <td style="padding: 0.625rem 0; white-space: nowrap" data-since>
                                    @if ($row->days === null)
                                        <strong>{{ __('panel.admin.dashboard.freshness.never') }}</strong>
                                    @elseif ($row->days >= $stale)
                                        <strong>{{ trans_choice('panel.admin.dashboard.freshness.days', $row->days, ['count' => $row->days]) }}</strong>
                                        <span style="{{ $muted }}">· {{ __('panel.admin.dashboard.freshness.stale') }}</span>
                                    @else
                                        {{ trans_choice('panel.admin.dashboard.freshness.days', $row->days, ['count' => $row->days]) }}
                                    @endif
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
            @if ($freshness['total'] > count($freshness['rows']))
                <p style="{{ $muted }}; font-size: 0.75rem; line-height: 1rem; margin: 0.75rem 0 0">{{ __('panel.admin.dashboard.freshness.more', ['shown' => count($freshness['rows']), 'total' => $freshness['total']]) }}</p>
            @endif
            <p style="{{ $muted }}; font-size: 0.75rem; line-height: 1rem; margin: 0.75rem 0 0">{{ __('panel.admin.dashboard.freshness.note') }}</p>
        @endif
    </x-filament::section>
</x-filament-widgets::widget>
