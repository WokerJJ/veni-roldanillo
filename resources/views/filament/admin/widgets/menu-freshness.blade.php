{{-- Frescura de los menús (Escritorio de administración, ADR 0050). Una
     tabla simple, legible con lector de pantalla; el estado va en texto, no
     solo en color. --}}
@php
    $freshness = $this->freshness();
    $stale = \App\Filament\Admin\Widgets\MenuFreshnessWidget::STALE_DAYS;
    $locale = app()->getLocale();
@endphp

<x-filament-widgets::widget>
    <x-filament::section :heading="__('panel.admin.dashboard.freshness.heading')" :description="__('panel.admin.dashboard.freshness.intro')">
        @if ($freshness['total'] === 0)
            <p style="opacity: 0.7" data-empty>{{ __('panel.admin.dashboard.freshness.empty') }}</p>
        @else
            <p data-summary style="margin-bottom: 0.75rem">{{ __('panel.admin.dashboard.freshness.summary', ['stale' => $freshness['stale'], 'total' => $freshness['total'], 'days' => $stale]) }}</p>
            <div style="overflow-x: auto">
                <table style="width: 100%; border-collapse: collapse">
                    <caption style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0">{{ __('panel.admin.dashboard.freshness.heading') }}</caption>
                    <thead>
                        <tr style="text-align: start; opacity: 0.7">
                            <th scope="col" style="padding: 0.25rem 1rem 0.25rem 0; text-align: start; font-weight: 500">{{ __('panel.admin.dashboard.freshness.restaurant') }}</th>
                            <th scope="col" style="padding: 0.25rem 1rem 0.25rem 0; text-align: start; font-weight: 500">{{ __('panel.admin.dashboard.freshness.last') }}</th>
                            <th scope="col" style="padding: 0.25rem 0; text-align: start; font-weight: 500">{{ __('panel.admin.dashboard.freshness.since') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($freshness['rows'] as $row)
                            @php($url = $this->restaurantUrl($row->id))
                            <tr data-restaurant="{{ $row->id }}" style="border-top: 1px solid rgba(128, 128, 128, 0.25)">
                                <th scope="row" style="padding: 0.375rem 1rem 0.375rem 0; text-align: start; font-weight: 400">
                                    @if ($url)
                                        <a href="{{ $url }}" style="text-decoration: underline">{{ $row->name }}</a>
                                    @else
                                        {{ $row->name }}
                                    @endif
                                    @if ($row->fictitious)
                                        <span style="opacity: 0.7; font-size: 0.75rem">({{ __('panel.admin.dashboard.freshness.example') }})</span>
                                    @endif
                                </th>
                                <td style="padding: 0.375rem 1rem 0.375rem 0; white-space: nowrap; font-variant-numeric: tabular-nums">
                                    {{ $row->last_at?->locale($locale)->isoFormat('D MMM YYYY') ?? '—' }}
                                </td>
                                <td style="padding: 0.375rem 0" data-since>
                                    @if ($row->days === null)
                                        <strong>{{ __('panel.admin.dashboard.freshness.never') }}</strong>
                                    @elseif ($row->days >= $stale)
                                        <strong>{{ trans_choice('panel.admin.dashboard.freshness.days', $row->days, ['count' => $row->days]) }}</strong>
                                        <span style="opacity: 0.7">· {{ __('panel.admin.dashboard.freshness.stale') }}</span>
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
                <p style="opacity: 0.7; font-size: 0.75rem; margin-top: 0.5rem">{{ __('panel.admin.dashboard.freshness.more', ['shown' => count($freshness['rows']), 'total' => $freshness['total']]) }}</p>
            @endif
            <p style="opacity: 0.7; font-size: 0.75rem; margin-top: 0.5rem">{{ __('panel.admin.dashboard.freshness.note') }}</p>
        @endif
    </x-filament::section>
</x-filament-widgets::widget>
