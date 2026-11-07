{{-- Mi carta (#114, ADR 0035): una tarjeta por plato, agrupadas por sección.
     Estilos en línea, las clases veni-* de la hoja del panel y componentes de
     Filament, sin scripts (como Hoy). Las tarjetas llegan ya armadas de
     MyMenu::getViewData(). «Agotado hoy» es un botón de dos estados
     (aria-pressed) que manda el valor al que se quiere llegar, no «cambiá lo
     que haya» (BUG-014); el estado se lee en texto («Hay» / «Agotado hoy») y
     en el ícono, no solo en el color. --}}
@php
    use App\Filament\Owner\Support\Fields;

    $big = 'min-height: 2.75rem';
@endphp

<x-filament-panels::page>
    <p class="veni-muted">{{ __('panel.my_menu.intro') }}</p>

    @if ($priceRange !== null)
        {{-- El rango de la ficha (ADR 0039): si sale raro, una sección que no son platos está contando. --}}
        <p data-price-range>{{ __('panel.my_menu.price_range', ['range' => $priceRange]) }}</p>
    @endif

    @forelse ($sections as $section)
        <x-filament::section :heading="$section['name']">
            <ul role="list">
                @foreach ($section['dishes'] as $dish)
                    @php
                        $soldOut = $dish['sold_out'];
                        // El mismo texto en wire:click y wire:target: el estado de carga es solo de este botón.
                        $toggle = 'setDishSoldOut('.$dish['id'].', '.($soldOut ? 'false' : 'true').')';
                    @endphp
                    <li
                        class="veni-divider"
                        data-dish="{{ $dish['id'] }}"
                        wire:key="dish-{{ $dish['id'] }}"
                        style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding: 0.75rem 0"
                    >
                        @if ($dish['thumbnail'] !== null)
                            <img src="{{ $dish['thumbnail'] }}" alt="" width="64" height="64" loading="lazy" style="width: 4rem; height: 4rem; border-radius: 0.5rem; object-fit: cover; flex: none">
                        @else
                            <span class="veni-muted veni-placeholder" style="display: flex; align-items: center; justify-content: center; width: 4rem; height: 4rem; border-radius: 0.5rem; flex: none; font-size: 0.75rem; text-align: center">{{ __('panel.my_menu.no_photo') }}</span>
                        @endif

                        <span style="flex: 1 1 10rem; min-width: 0">
                            <span style="display: block; font-weight: 600">{{ $dish['name'] }}</span>
                            <span style="display: block; font-variant-numeric: tabular-nums">{{ Fields::formatPesos($dish['price']) }}</span>
                            <span class="veni-muted" style="display: block" data-state="{{ $soldOut ? 'sold-out' : 'available' }}">
                                {{ $soldOut ? __('panel.my_menu.sold_out') : __('panel.my_menu.available') }}@unless ($dish['available']) · {{ __('panel.my_menu.hidden') }}@endunless
                            </span>
                        </span>

                        <span style="display: flex; flex-wrap: wrap; gap: 0.5rem">
                            <x-filament::button
                                size="lg"
                                :color="$soldOut ? 'warning' : 'gray'"
                                :outlined="! $soldOut"
                                :icon="$soldOut ? 'heroicon-o-no-symbol' : null"
                                wire:click="{{ $toggle }}"
                                wire:target="{{ $toggle }}"
                                aria-pressed="{{ $soldOut ? 'true' : 'false' }}"
                                aria-label="{{ __('panel.my_menu.switch_label', ['name' => $dish['name']]) }}"
                                style="{{ $big }}"
                            >
                                {{ __('panel.my_menu.sold_out') }}
                            </x-filament::button>
                            <x-filament::button
                                size="lg"
                                color="gray"
                                icon="heroicon-o-pencil-square"
                                tag="a"
                                :href="$dish['edit_url']"
                                aria-label="{{ __('panel.my_menu.edit_label', ['name' => $dish['name']]) }}"
                                style="{{ $big }}"
                            >
                                {{ __('panel.my_menu.edit') }}
                            </x-filament::button>
                        </span>
                    </li>
                @endforeach
            </ul>
        </x-filament::section>
    @empty
        <p data-empty="dishes">{{ __('panel.my_menu.empty') }}</p>
    @endforelse
</x-filament-panels::page>
