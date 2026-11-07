<?php

namespace App\Filament\Owner\Pages;

use App\Enums\MediaKind;
use App\Filament\Owner\Concerns\ResolvesOwnerTenant;
use App\Filament\Owner\Concerns\SetsSoldOutToday;
use App\Filament\Owner\Resources\Dishes\DishResource;
use App\Filament\Owner\Support\Fields;
use App\Filament\Owner\Support\TouchTarget;
use App\Models\Dish;
use App\Models\Restaurant;
use App\Support\Media\MediaStore;
use Filament\Actions\Action;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Database\Eloquent\Collection;

/**
 * Mi carta (#114, ADR 0035): los platos del restaurante con su foto, su
 * precio y el interruptor «Agotado hoy», pensados para el celular. Editar la
 * foto, el nombre, el precio y la descripción abre EditDishBasics (la
 * edición corta del mismo DishResource, con sus mismas protecciones); lo
 * demás del plato sigue en la edición completa.
 *
 * Solo los platos del restaurante de la dirección (el tenant, que Filament ya
 * comprobó), autorizados con RestaurantPolicy::update.
 *
 * La vista recibe las tarjetas ya armadas (getViewData()): leer los platos,
 * la miniatura y el enlace de edición son métodos protegidos, que el
 * navegador no puede llamar con un plato de otro restaurante (BUG-020).
 *
 * @phpstan-type DishCard array{id: int, name: string, price: int, available: bool, sold_out: bool, thumbnail: string|null, edit_url: string}
 */
class MyMenu extends Page
{
    use ResolvesOwnerTenant, SetsSoldOutToday;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedBookOpen;

    protected static ?int $navigationSort = -2;

    protected static ?string $slug = 'my-menu';

    protected string $view = 'filament.owner.pages.my-menu';

    public static function getNavigationLabel(): string
    {
        return __('panel.my_menu.label');
    }

    public function getTitle(): string
    {
        return __('panel.my_menu.heading');
    }

    /**
     * @return array<Action>
     */
    protected function getHeaderActions(): array
    {
        return [
            TouchTarget::big(Action::make('addDish'))
                ->label(__('panel.my_menu.add'))
                ->icon(Heroicon::OutlinedPlus)
                ->visible(fn (): bool => DishResource::canCreate())
                ->url(fn (): string => DishResource::getUrl('create')),
        ];
    }

    /**
     * Las tarjetas por sección, en el orden de la carta.
     *
     * @return array<string, mixed>
     */
    protected function getViewData(): array
    {
        $sections = $this->dishes()
            ->groupBy('menu_section_id')
            ->map(fn (Collection $dishes): array => [
                'name' => $dishes->first()?->menuSection?->name_es,
                'dishes' => $dishes->map(fn (Dish $dish): array => $this->card($dish))->values()->all(),
            ])
            ->values()
            ->all();

        return ['sections' => $sections, 'priceRange' => $this->priceRangeText()];
    }

    /**
     * «Platos de $16.000 a $22.000», el rango que muestra la ficha (ADR
     * 0039), para que el dueño note si una sección de bebidas o adiciones
     * quedó contando. Null si no hay platos que contar.
     */
    protected function priceRangeText(): ?string
    {
        $range = Restaurant::query()->select('id')->withMenuPriceRange()
            ->whereKey($this->restaurant()->getKey())
            ->firstOrFail()
            ->menuPriceRange();

        if ($range === null) {
            return null;
        }

        return $range['min'] === $range['max']
            ? __('restaurant.price_single', ['price' => Fields::formatPesos($range['min'])])
            : __('restaurant.price_range', ['min' => Fields::formatPesos($range['min']), 'max' => Fields::formatPesos($range['max'])]);
    }

    /** @return Collection<int, Dish> */
    protected function dishes(): Collection
    {
        return $this->restaurant()->dishes()
            ->with('menuSection:id,name_es,position')
            ->join('menu_sections', 'menu_sections.id', '=', 'dishes.menu_section_id')
            ->orderBy('menu_sections.position')->orderBy('menu_sections.id')
            ->orderBy('dishes.position')->orderBy('dishes.id')
            ->select('dishes.*')
            ->get();
    }

    /** @return DishCard */
    protected function card(Dish $dish): array
    {
        return [
            'id' => $dish->id,
            'name' => $dish->name_es,
            'price' => $dish->price,
            'available' => $dish->available,
            'sold_out' => $dish->isSoldOutToday(),
            'thumbnail' => $this->thumbnail($dish),
            'edit_url' => DishResource::getUrl('basics', ['record' => $dish]),
        ];
    }

    /** La miniatura del plato (192 px para 64 px en pantalla), o null. */
    protected function thumbnail(Dish $dish): ?string
    {
        return MediaStore::isKey($dish->photo_path, MediaKind::Dish) && is_string($dish->photo_path)
            ? MediaStore::url($dish->photo_path, MediaKind::Dish->widths()[0])
            : null;
    }
}
