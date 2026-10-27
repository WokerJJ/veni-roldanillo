<?php

namespace App\Filament\Owner\Resources\DeliveryZones;

use App\Filament\Owner\OwnerResource;
use App\Filament\Owner\Resources\DeliveryZones\Pages\CreateDeliveryZone;
use App\Filament\Owner\Resources\DeliveryZones\Pages\EditDeliveryZone;
use App\Filament\Owner\Resources\DeliveryZones\Pages\ListDeliveryZones;
use App\Filament\Owner\Support\Fields;
use App\Models\DeliveryZone;
use App\Models\Neighborhood;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

/**
 * Zonas de domicilio: a qué barrios lleva y cuánto cuesta. Un barrio por
 * restaurante (único en la base). Con zonas cargadas, mandan sobre
 * restaurants.delivery (ADR 0009).
 */
class DeliveryZoneResource extends OwnerResource
{
    /** Tope del costo de un domicilio, en pesos. */
    public const MAX_FEE = 100_000;

    /** Tope por restaurante (OwnerResource::canCreate, ADR 0025). */
    public const int MAX_PER_RESTAURANT = 100;

    protected static ?string $model = DeliveryZone::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedTruck;

    protected static ?int $navigationSort = 6;

    protected static ?string $slug = 'delivery-zones';

    public static function getModelLabel(): string
    {
        return __('panel.zones.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.zones.plural');
    }

    public static function constraintErrorField(): string
    {
        return 'data.neighborhood_id';
    }

    public static function form(Schema $schema): Schema
    {
        $restaurantId = static::currentRestaurant()?->id;

        return $schema->components([
            Select::make('neighborhood_id')
                ->label(__('panel.zones.neighborhood'))
                ->options(fn (): array => Neighborhood::query()->orderBy('name')->pluck('name', 'id')->all())
                ->searchable()
                ->required()
                ->rule(Rule::exists('neighborhoods', 'id'))
                ->unique(
                    table: 'delivery_zones',
                    column: 'neighborhood_id',
                    ignoreRecord: true,
                    modifyRuleUsing: fn (Unique $rule): Unique => $rule->where('restaurant_id', $restaurantId),
                ),
            Fields::pesos('fee', __('panel.zones.fee'), self::MAX_FEE),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn (Builder $query): Builder => $query->with('neighborhood'))
            ->columns([
                TextColumn::make('neighborhood.name')->label(__('panel.zones.neighborhood'))->searchable(),
                TextColumn::make('fee')->label(__('panel.zones.fee'))->money('COP', decimalPlaces: 0)->sortable(),
            ])
            ->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListDeliveryZones::route('/'),
            'create' => CreateDeliveryZone::route('/create'),
            'edit' => EditDeliveryZone::route('/{record}/edit'),
        ];
    }
}
