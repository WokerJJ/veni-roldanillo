<?php

namespace App\Filament\Owner\Resources\Ingredients;

use App\Filament\Owner\OwnerResource;
use App\Filament\Owner\Resources\Ingredients\Pages\CreateIngredient;
use App\Filament\Owner\Resources\Ingredients\Pages\EditIngredient;
use App\Filament\Owner\Resources\Ingredients\Pages\ListIngredients;
use App\Filament\Owner\Support\Fields;
use App\Models\Ingredient;
use App\Support\BusinessDay;
use Closure;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * La lista común de ingredientes del restaurante (#112, ADR 0033): «agotado
 * hoy», que vence solo a la medianoche de Colombia, y el reemplazo por
 * defecto con su recargo. Qué ingredientes lleva cada plato se marca en el
 * plato (DishResource); qué opción es un ingrediente, en sus opciones.
 */
class IngredientResource extends OwnerResource
{
    /** Tope por restaurante (OwnerResource::canCreate, ADR 0025). */
    public const int MAX_PER_RESTAURANT = 100;

    /** Recargo máximo de un reemplazo, como el CHECK ingredients_substitute_valid. */
    public const int MAX_SUBSTITUTE_PRICE = 100_000;

    protected static ?string $model = Ingredient::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedBeaker;

    protected static ?int $navigationSort = 3;

    protected static ?string $slug = 'ingredients';

    public static function getModelLabel(): string
    {
        return __('panel.ingredients.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.ingredients.plural');
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
                // Como el índice ingredients_restaurant_name_unique (sin
                // mayúsculas), pero con su propio aviso (AUD-004).
                Fields::text('name_es', __('panel.fields.name_es'), 80, required: true)
                    ->rule(fn (?Ingredient $record): Closure => function (string $attribute, mixed $value, Closure $fail) use ($record, $restaurantId): void {
                        $taken = Ingredient::query()
                            ->where('restaurant_id', $restaurantId)
                            ->whereRaw('lower(name_es) = lower(?)', [is_string($value) ? $value : ''])
                            ->when($record !== null, fn (Builder $query) => $query->whereKeyNot($record?->getKey()))
                            ->exists();

                        if ($taken) {
                            $fail(__('panel.ingredients.name_taken'));
                        }
                    }),
                Fields::text('name_en', __('panel.fields.name_en'), 80),
                Toggle::make('sold_out_today')
                    ->label(__('panel.ingredients.sold_out_today'))
                    ->helperText(__('panel.ingredients.sold_out_help'))
                    ->afterStateHydrated(fn (Toggle $component, ?Ingredient $record) => $component->state($record?->isSoldOutToday() ?? false))
                    ->columnSpanFull(),
                // Solo otros ingredientes de este restaurante; la FK compuesta
                // y el CHECK de la base lo aseguran también.
                Select::make('substitute_ingredient_id')
                    ->label(__('panel.ingredients.substitute'))
                    ->helperText(__('panel.ingredients.substitute_help'))
                    ->options(fn (?Ingredient $record): array => Ingredient::query()
                        ->where('restaurant_id', $restaurantId)
                        ->when($record !== null, fn (Builder $query) => $query->whereKeyNot($record?->getKey()))
                        ->orderBy('name_es')->orderBy('id')
                        ->pluck('name_es', 'id')
                        ->all())
                    ->rule(Rule::exists('ingredients', 'id')->where('restaurant_id', $restaurantId))
                    ->rule(fn (?Ingredient $record) => Rule::notIn($record === null ? [] : [$record->getKey()]))
                    ->live(),
                Fields::pesos('substitute_price_delta', __('panel.ingredients.substitute_price'), self::MAX_SUBSTITUTE_PRICE)
                    ->default(0)
                    ->visible(fn (Get $get): bool => filled($get('substitute_ingredient_id'))),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn (Builder $query): Builder => $query->with('substitute:id,name_es'))
            ->defaultSort('name_es')
            ->columns([
                TextColumn::make('name_es')->label(__('panel.fields.name'))->searchable(),
                IconColumn::make('sold_out_until')
                    ->label(__('panel.ingredients.sold_out_today'))
                    ->state(fn (Ingredient $record): bool => $record->isSoldOutToday())
                    ->boolean(),
                TextColumn::make('substitute.name_es')->label(__('panel.ingredients.substitute')),
                TextColumn::make('dish_links_count')->label(__('panel.ingredients.dishes_count'))->counts('dishLinks'),
            ])
            ->recordActions([
                // Dos acciones con valor fijo, no un interruptor (BUG-014):
                // tocar «Agotado hoy» desde una lista vieja no lo devuelve.
                Action::make('markSoldOut')
                    ->label(__('panel.ingredients.mark_sold_out'))
                    ->icon('heroicon-o-no-symbol')
                    ->color('warning')
                    ->visible(fn (Ingredient $record): bool => ! $record->isSoldOutToday())
                    ->authorize(fn (Ingredient $record): bool => Gate::allows('update', $record))
                    ->action(fn (Ingredient $record) => self::setSoldOutToday($record, true)),
                Action::make('backInStock')
                    ->label(__('panel.ingredients.back_in_stock'))
                    ->icon('heroicon-o-check-circle')
                    ->color('success')
                    ->visible(fn (Ingredient $record): bool => $record->isSoldOutToday())
                    ->authorize(fn (Ingredient $record): bool => Gate::allows('update', $record))
                    ->action(fn (Ingredient $record) => self::setSoldOutToday($record, false)),
                EditAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListIngredients::route('/'),
            'create' => CreateIngredient::route('/create'),
            'edit' => EditIngredient::route('/{record}/edit'),
        ];
    }

    private static function setSoldOutToday(Ingredient $ingredient, bool $soldOut): void
    {
        $ingredient->setSoldOutToday($soldOut);
        // Cambia lo que muestra la ficha: «Actualizada el…».
        OwnerResource::currentRestaurant()?->touchOwnerUpdate();
    }

    /**
     * El campo donde se avisa si la base rechaza el ingrediente (AUD-004):
     * las restricciones del reemplazo, en el reemplazo; lo demás, en el
     * nombre.
     */
    public static function fieldForConstraint(?string $constraint): string
    {
        return str_starts_with((string) $constraint, 'ingredients_substitute_')
            ? 'data.substitute_ingredient_id'
            : self::constraintErrorField();
    }

    /** El aviso antes de borrar: en cuántos platos y opciones está. */
    public static function usage(Ingredient $ingredient): string
    {
        $dishes = $ingredient->dishLinks()->count();
        $options = $ingredient->options()->count();

        return $dishes === 0 && $options === 0
            ? __('panel.ingredients.not_in_use')
            : __('panel.ingredients.in_use', ['dishes' => $dishes, 'options' => $options]);
    }

    /**
     * El interruptor «Agotado hoy» se guarda como sold_out_until; sin
     * reemplazo, el recargo vuelve a 0 (lo llaman CreateIngredient y
     * EditIngredient).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function mutateFormData(array $data): array
    {
        $soldOut = (bool) ($data['sold_out_today'] ?? false);
        unset($data['sold_out_today']);
        $data['sold_out_until'] = $soldOut ? BusinessDay::today()->toDateString() : null;

        if (blank($data['substitute_ingredient_id'] ?? null)) {
            $data['substitute_ingredient_id'] = null;
            $data['substitute_price_delta'] = 0;
        }

        return $data;
    }
}
