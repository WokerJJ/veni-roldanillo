{{-- Hoy (#114, ADR 0035): pensada para el celular. Como en las estadísticas,
     sin tema propio de Filament las clases de Tailwind no se compilan: el
     diseño va con estilos en línea (style-src-attr del perfil «panel»), las
     clases veni-* de la hoja del panel (resources/css/filament/owner-panel.css,
     lo que cambia en modo oscuro) y los componentes de Filament, que ya traen
     el foco visible. Sin scripts. Los botones miden 44 px de alto como mínimo
     y el estado se dice con texto, no solo con color. Los datos llegan de
     Today::getViewData(). --}}
@php
    use App\Filament\Owner\Support\Fields;

    $row = 'display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 0';
    $big = 'min-height: 2.75rem';
@endphp

<x-filament-panels::page>
    <p class="veni-muted">{{ __('panel.today.intro') }}</p>

    <x-filament::section :heading="__('panel.today.dishes_heading')">
        @if ($dishes->isEmpty())
            <p data-empty="dishes">{{ __('panel.today.no_dishes') }}</p>
            <p class="veni-muted" style="margin-top: 0.25rem">{{ __('panel.today.dishes_hint') }}</p>
        @else
            <ul role="list">
                @foreach ($dishes as $dish)
                    <li class="veni-divider" style="{{ $row }}" data-dish="{{ $dish->id }}" wire:key="dish-{{ $dish->id }}">
                        <span style="font-weight: 500">{{ $dish->name_es }}</span>
                        <x-filament::button
                            size="lg"
                            color="success"
                            icon="heroicon-o-check-circle"
                            wire:click="setDishSoldOut({{ $dish->id }}, false)"
                            wire:target="setDishSoldOut({{ $dish->id }}, false)"
                            aria-label="{{ __('panel.today.back_label', ['name' => $dish->name_es]) }}"
                            style="{{ $big }}"
                        >
                            {{ __('panel.today.back') }}
                        </x-filament::button>
                    </li>
                @endforeach
            </ul>
        @endif
    </x-filament::section>

    <x-filament::section :heading="__('panel.today.ingredients_heading')">
        @if ($ingredients->isEmpty())
            <p data-empty="ingredients">{{ __('panel.today.no_ingredients') }}</p>
        @else
            <ul role="list">
                @foreach ($ingredients as $ingredient)
                    <li class="veni-divider" style="{{ $row }}" data-ingredient="{{ $ingredient->id }}" wire:key="ingredient-{{ $ingredient->id }}">
                        <span>
                            <span style="display: block; font-weight: 500">{{ $ingredient->name_es }}</span>
                            <span class="veni-muted" style="display: block">
                                @if ($ingredient->substitute !== null)
                                    @if ($ingredient->substitute_price_delta > 0)
                                        {{ __('panel.today.substitute_price', ['name' => $ingredient->substitute->name_es, 'price' => Fields::formatPesos($ingredient->substitute_price_delta)]) }}
                                    @else
                                        {{ __('panel.today.substitute', ['name' => $ingredient->substitute->name_es]) }}
                                    @endif
                                @else
                                    {{ __('panel.today.no_substitute') }}
                                @endif
                            </span>
                        </span>
                        <x-filament::button
                            size="lg"
                            color="success"
                            icon="heroicon-o-check-circle"
                            wire:click="setIngredientSoldOut({{ $ingredient->id }}, false)"
                            wire:target="setIngredientSoldOut({{ $ingredient->id }}, false)"
                            aria-label="{{ __('panel.today.back_label', ['name' => $ingredient->name_es]) }}"
                            style="{{ $big }}"
                        >
                            {{ __('panel.today.back') }}
                        </x-filament::button>
                    </li>
                @endforeach
            </ul>
        @endif

        <div style="margin-top: 0.75rem">{{ $this->markIngredientMissingAction }}</div>
    </x-filament::section>

    <x-filament::section :heading="__('panel.today.delay_heading')">
        <p data-delay aria-live="polite">
            {{ $delay === null ? __('panel.today.no_delay') : __('panel.delay.active', ['minutes' => $delay]) }}
        </p>
        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.75rem">
            {{ $this->announceDelayAction }}
            {{ $this->clearDelayAction }}
        </div>
    </x-filament::section>

    <x-filament::section :heading="__('panel.lunch.heading')">
        @if ($lunch === null)
            <p data-lunch="none">{{ __('panel.lunch.none') }}</p>
        @else
            <p data-lunch="{{ $lunch->id }}">{{ $lunch->description_es }}</p>
            <p style="font-size: 1.25rem; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 0.25rem">{{ Fields::formatPesos($lunch->price) }}</p>
        @endif
        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.75rem">
            {{ $this->publishLunchAction }}
            {{ $this->clearLunchAction }}
        </div>
    </x-filament::section>
</x-filament-panels::page>
