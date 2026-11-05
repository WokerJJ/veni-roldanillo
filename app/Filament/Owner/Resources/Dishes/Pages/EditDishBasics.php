<?php

namespace App\Filament\Owner\Resources\Dishes\Pages;

use App\Enums\MediaKind;
use App\Filament\Owner\Pages\MyMenu;
use App\Filament\Owner\Resources\Dishes\DishResource;
use App\Filament\Owner\Support\EditOwnerRecord;
use App\Filament\Owner\Support\Fields;
use App\Filament\Owner\Support\MediaUpload;
use App\Models\Dish;
use Filament\Actions\Action;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Illuminate\Contracts\Support\Htmlable;
use Illuminate\Support\Arr;

/**
 * La edición corta de un plato desde Mi carta (#114, ADR 0035): la foto, el
 * nombre, el precio y la descripción, con el nombre y la descripción en
 * inglés opcionales en una sección plegada, y nada más. Es una página más del
 * mismo DishResource: el plato llega filtrado por el restaurante de la
 * dirección y autorizado por RestaurantContentPolicy, y guarda como la
 * edición completa (EditOwnerRecord): control optimista
 * (DetectsConcurrentEdits), la foto por HandlesMediaUpload, las
 * restricciones de la base como aviso y «Actualizada el…».
 *
 * Solo se guardan sus campos (FIELDS) y la foto: «agotado hoy», la sección, los
 * ingredientes y las opciones no viajan y no cambian.
 */
class EditDishBasics extends EditOwnerRecord
{
    /** Lo que guarda esta página, además de la foto. */
    public const array FIELDS = ['name_es', 'price', 'description_es', 'name_en', 'description_en'];

    protected static string $resource = DishResource::class;

    public function form(Schema $schema): Schema
    {
        return $schema->components([
            Section::make()->columnSpanFull()->schema([
                Fields::text('name_es', __('panel.fields.name'), 120, required: true),
                Fields::pesos('price', __('panel.dishes.price')),
                Fields::longText('description_es', __('panel.my_menu.description'), DishResource::DESCRIPTION_MAX),
            ]),
            // Opcional y plegado: la ficha en inglés usa el español si falta.
            Section::make(__('panel.my_menu.english'))
                ->description(__('panel.my_menu.english_help'))
                ->collapsible()
                ->collapsed()
                ->columnSpanFull()
                ->schema([
                    Fields::text('name_en', __('panel.fields.name_en'), 120),
                    Fields::longText('description_en', __('panel.fields.description_en'), DishResource::DESCRIPTION_MAX),
                ]),
            MediaUpload::section(MediaKind::Dish),
        ]);
    }

    public function getTitle(): string|Htmlable
    {
        $record = $this->getRecord();

        return __('panel.my_menu.edit_heading', ['name' => $record instanceof Dish ? $record->name_es : '']);
    }

    /**
     * @return array<string, string>
     */
    public function getBreadcrumbs(): array
    {
        return [MyMenu::getUrl() => MyMenu::getNavigationLabel()];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeSave(array $data): array
    {
        /** @var array<string, mixed> $fields */
        $fields = Arr::only($this->pullMediaState($data), self::FIELDS);

        return $fields;
    }

    /** Sin borrar desde aquí; lo demás del plato, en la edición completa. */
    protected function getHeaderActions(): array
    {
        return [
            Action::make('allOptions')
                ->label(__('panel.my_menu.all_options'))
                ->color('gray')
                ->url(fn (): string => DishResource::getUrl('edit', ['record' => $this->getRecord()])),
        ];
    }

    protected function getRedirectUrl(): string
    {
        return MyMenu::getUrl();
    }
}
