<?php

namespace App\Filament\Owner\Resources\Dishes;

use App\Enums\MediaKind;
use App\Filament\Owner\OwnerResource;
use App\Filament\Owner\Resources\Dishes\Pages\CreateDish;
use App\Filament\Owner\Resources\Dishes\Pages\EditDish;
use App\Filament\Owner\Resources\Dishes\Pages\ListDishes;
use App\Filament\Owner\Resources\Dishes\RelationManagers\OptionGroupsRelationManager;
use App\Filament\Owner\Support\Fields;
use App\Filament\Owner\Support\MediaUpload;
use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\MenuSection;
use App\Support\BusinessDay;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Repeater;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Platos del menú, con su precio en pesos enteros, «agotado hoy» y sus
 * grupos de opciones (OptionGroupsRelationManager).
 *
 * Los ingredientes que lleva (#112, ADR 0033) van en el mismo formulario,
 * como un repetidor de filas de dish_ingredient: cuál de la lista del
 * restaurante y si es esencial. Tope: MAX_INGREDIENTS por plato.
 */
class DishResource extends OwnerResource
{
    public const DESCRIPTION_MAX = 500;

    /** Tope por restaurante (OwnerResource::canCreate, ADR 0025). */
    public const int MAX_PER_RESTAURANT = 200;

    /** Ingredientes por plato: viajan en las props de la ficha si se agotan. */
    public const int MAX_INGREDIENTS = 20;

    protected static ?string $model = Dish::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedBookOpen;

    protected static ?int $navigationSort = 2;

    protected static ?string $slug = 'dishes';

    public static function getModelLabel(): string
    {
        return __('panel.dishes.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.dishes.plural');
    }

    public static function getNavigationGroup(): ?string
    {
        return __('panel.nav.menu');
    }

    public static function form(Schema $schema): Schema
    {
        $restaurantId = static::currentRestaurant()?->id;

        return $schema->components([
            Section::make()->columns(2)->columnSpanFull()->schema([
                // Solo las secciones de este restaurante; la FK compuesta de
                // la base lo asegura también.
                Select::make('menu_section_id')
                    ->label(__('panel.sections.label'))
                    ->options(fn (): array => MenuSection::query()
                        ->where('restaurant_id', $restaurantId)
                        ->orderBy('position')->orderBy('id')
                        ->pluck('name_es', 'id')
                        ->all())
                    ->rule(Rule::exists('menu_sections', 'id')->where('restaurant_id', $restaurantId))
                    ->required()
                    ->columnSpanFull(),
                Fields::text('name_es', __('panel.fields.name_es'), 120, required: true),
                Fields::text('name_en', __('panel.fields.name_en'), 120),
                Fields::longText('description_es', __('panel.fields.description_es'), self::DESCRIPTION_MAX),
                Fields::longText('description_en', __('panel.fields.description_en'), self::DESCRIPTION_MAX),
                Fields::pesos('price', __('panel.dishes.price')),
                Fields::position(),
                Toggle::make('available')
                    ->label(__('panel.dishes.available'))
                    ->helperText(__('panel.dishes.available_help'))
                    ->default(true),
                Toggle::make('sold_out_today')
                    ->label(__('panel.dishes.sold_out_today'))
                    ->helperText(__('panel.dishes.sold_out_help'))
                    ->afterStateHydrated(fn (Toggle $component, ?Dish $record) => $component->state(self::isSoldOutToday($record))),
            ]),
            MediaUpload::section(MediaKind::Dish),
            Section::make(__('panel.ingredients.dish_section'))
                ->description(__('panel.ingredients.dish_section_help'))
                ->columnSpanFull()
                ->schema([
                    Repeater::make('dishIngredients')
                        ->hiddenLabel()
                        ->relationship('dishIngredients')
                        ->maxItems(self::MAX_INGREDIENTS)
                        ->defaultItems(0)
                        ->addActionLabel(__('panel.ingredients.add'))
                        ->columns(2)
                        ->schema([
                            // Solo los de este restaurante; las FK compuestas
                            // de dish_ingredient lo aseguran también.
                            Select::make('ingredient_id')
                                ->label(__('panel.ingredients.label'))
                                ->options(fn (): array => Ingredient::query()
                                    ->where('restaurant_id', $restaurantId)
                                    ->orderBy('name_es')->orderBy('id')
                                    ->pluck('name_es', 'id')
                                    ->all())
                                ->rule(Rule::exists('ingredients', 'id')->where('restaurant_id', $restaurantId))
                                ->distinct()
                                ->disableOptionsWhenSelectedInSiblingRepeaterItems()
                                ->required(),
                            Toggle::make('essential')
                                ->label(__('panel.ingredients.essential'))
                                ->default(false)
                                ->inline(false),
                        ]),
                ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn (Builder $query): Builder => $query->with('menuSection'))
            ->defaultSort('position')
            ->columns([
                TextColumn::make('name_es')->label(__('panel.fields.name'))->searchable(),
                TextColumn::make('menuSection.name_es')->label(__('panel.sections.label')),
                TextColumn::make('price')->label(__('panel.dishes.price'))->money('COP', decimalPlaces: 0)->sortable(),
                IconColumn::make('sold_out_until')
                    ->label(__('panel.dishes.sold_out_today'))
                    ->state(fn (Dish $record): bool => self::isSoldOutToday($record))
                    ->boolean(),
                IconColumn::make('available')->label(__('panel.dishes.available'))->boolean(),
            ])
            ->recordActions([
                // Dos acciones con valor fijo, no un interruptor (BUG-014):
                // tocar «Agotado hoy» desde una lista vieja no lo devuelve.
                Action::make('markSoldOut')
                    ->label(__('panel.dishes.mark_sold_out'))
                    ->icon('heroicon-o-no-symbol')
                    ->color('warning')
                    ->visible(fn (Dish $record): bool => ! self::isSoldOutToday($record))
                    ->authorize(fn (Dish $record): bool => Gate::allows('update', $record))
                    ->action(function (Dish $record): void {
                        self::setSoldOutToday($record, true);
                        OwnerResource::currentRestaurant()?->touchOwnerUpdate();
                    }),
                Action::make('backInStock')
                    ->label(__('panel.dishes.back_in_stock'))
                    ->icon('heroicon-o-check-circle')
                    ->color('success')
                    ->visible(fn (Dish $record): bool => self::isSoldOutToday($record))
                    ->authorize(fn (Dish $record): bool => Gate::allows('update', $record))
                    ->action(function (Dish $record): void {
                        self::setSoldOutToday($record, false);
                        OwnerResource::currentRestaurant()?->touchOwnerUpdate();
                    }),
                EditAction::make(),
            ]);
    }

    public static function getRelations(): array
    {
        return [OptionGroupsRelationManager::class];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListDishes::route('/'),
            'create' => CreateDish::route('/create'),
            'edit' => EditDish::route('/{record}/edit'),
        ];
    }

    /**
     * «Agotado hoy» (ADR 0018): sold_out_until es el día de Colombia hasta el
     * que no hay; a la medianoche el plato vuelve solo.
     */
    public static function isSoldOutToday(?Dish $dish): bool
    {
        return $dish?->sold_out_until !== null
            && $dish->sold_out_until->toDateString() >= BusinessDay::today()->toDateString();
    }

    /** La foto del plato, cuadrada (#113, ADR 0034). */
    public static function mediaKind(): MediaKind
    {
        return MediaKind::Dish;
    }

    /**
     * El interruptor «Agotado hoy» del formulario se guarda como
     * sold_out_until (lo llaman CreateDish y EditDish).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function mutateFormData(array $data): array
    {
        $soldOut = (bool) ($data['sold_out_today'] ?? false);
        unset($data['sold_out_today']);
        $data['sold_out_until'] = $soldOut ? BusinessDay::today()->toDateString() : null;

        return $data;
    }

    public static function setSoldOutToday(Dish $dish, bool $soldOut): void
    {
        $dish->forceFill(['sold_out_until' => $soldOut ? BusinessDay::today()->toDateString() : null])->save();
    }
}
