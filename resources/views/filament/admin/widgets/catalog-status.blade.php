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
    // Texto atenuado: 75 % del color del texto (≈ 7:1 en claro y oscuro). La
    // opacidad del elemento también aclararía a sus hijos.
    $muted = 'color: color-mix(in oklab, currentColor 75%, transparent)';
@endphp

<x-filament-widgets::widget>
    <x-filament::section :heading="__('panel.admin.dashboard.catalog.heading')">
        <ul style="display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); list-style: none; margin: 0; padding: 0">
            @foreach ($cards as $card)
                <li data-card="{{ $card['key'] }}" style="display: flex; flex-direction: column; gap: 0.25rem; padding: 1rem; border: 1px solid color-mix(in oklab, var(--gray-500) 30%, transparent); border-radius: 0.5rem">
                    <p style="{{ $muted }}; font-size: 0.875rem; line-height: 1.25rem; margin: 0">{{ __('panel.admin.dashboard.catalog.'.$card['key']) }}</p>
                    <p style="font-size: 1.875rem; line-height: 2.25rem; font-weight: 600; font-variant-numeric: tabular-nums; margin: 0" data-value>{{ $card['value'] }}</p>
                    @if ($card['hint'])
                        <p style="{{ $muted }}; font-size: 0.75rem; line-height: 1rem; margin: 0">{{ $card['hint'] }}</p>
                    @endif
                    @if ($card['link'])
                        <a href="{{ $card['link'] }}" style="display: inline-flex; align-items: center; align-self: flex-start; min-height: 2.75rem; margin-top: auto; font-size: 0.875rem; font-weight: 500; text-decoration: underline; text-underline-offset: 0.2em; color: inherit">{{ __('panel.admin.dashboard.catalog.see') }}<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0)"> — {{ __('panel.admin.dashboard.catalog.'.$card['key']) }}</span></a>
                    @endif
                </li>
            @endforeach
        </ul>
    </x-filament::section>
</x-filament-widgets::widget>
