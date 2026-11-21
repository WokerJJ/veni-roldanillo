{{-- Estado del catálogo (Escritorio de administración, ADR 0050). Estilos en
     línea: el panel de administración no tiene tema propio (style-src-attr del
     perfil «panel», ADR 0025). --}}
@php
    $overview = $this->overview();
    $links = $this->links();
    $cards = [
        ['key' => 'published', 'value' => $overview->published(), 'link' => $links['restaurants'], 'hint' => __('panel.admin.dashboard.catalog.published_hint', ['unclaimed' => $overview->unclaimed])],
        ['key' => 'claimed', 'value' => $overview->claimed, 'link' => $links['restaurants'], 'hint' => null],
        ['key' => 'hidden', 'value' => $overview->hidden, 'link' => $links['restaurants'], 'hint' => __('panel.admin.dashboard.catalog.hidden_hint')],
        ['key' => 'claims', 'value' => $overview->pendingClaims, 'link' => $links['claims'], 'hint' => null],
        ['key' => 'removals', 'value' => $overview->pendingRemovals, 'link' => $links['removals'], 'hint' => null],
        ['key' => 'field', 'value' => $overview->openFieldSubmissions, 'link' => $links['field'], 'hint' => null],
    ];
@endphp

<x-filament-widgets::widget>
    <x-filament::section :heading="__('panel.admin.dashboard.catalog.heading')">
        <ul style="display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); list-style: none; margin: 0; padding: 0">
            @foreach ($cards as $card)
                <li data-card="{{ $card['key'] }}">
                    <p style="opacity: 0.7">{{ __('panel.admin.dashboard.catalog.'.$card['key']) }}</p>
                    <p style="font-size: 1.875rem; font-weight: 600; font-variant-numeric: tabular-nums" data-value>{{ $card['value'] }}</p>
                    @if ($card['hint'])
                        <p style="opacity: 0.7; font-size: 0.75rem">{{ $card['hint'] }}</p>
                    @endif
                    @if ($card['link'])
                        <a href="{{ $card['link'] }}" style="font-size: 0.875rem; text-decoration: underline; color: var(--primary-600)">{{ __('panel.admin.dashboard.catalog.see') }}<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0)"> — {{ __('panel.admin.dashboard.catalog.'.$card['key']) }}</span></a>
                    @endif
                </li>
            @endforeach
        </ul>
    </x-filament::section>
</x-filament-widgets::widget>
