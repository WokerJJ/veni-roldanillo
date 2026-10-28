<?php

namespace App\Filament\Admin\Resources\Restaurants;

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Restaurants\HideRestaurant;
use App\Actions\Restaurants\PublishRestaurant;
use App\Actions\Restaurants\RestaurantStatusRules;
use App\Enums\RestaurantPlan;
use App\Enums\RestaurantStatus;
use App\Filament\Admin\AdminResource;
use App\Filament\Admin\Resources\Restaurants\Pages\CreateRestaurant;
use App\Filament\Admin\Resources\Restaurants\Pages\EditRestaurant;
use App\Filament\Admin\Resources\Restaurants\Pages\ListRestaurants;
use App\Filament\Owner\Support\Fields;
use App\Models\Restaurant;
use App\Support\GeoPoint;
use App\Support\RestaurantSlug;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/**
 * Las fichas, para administración (#19, ADR 0027): alta manual y edición de
 * lo que el dueño no toca (slug, estado, plan, verificada, ficticia,
 * ubicación y categorías), y la moderación mínima: ocultar o mostrar una
 * ficha y ver cuándo la actualizó el restaurante.
 *
 * Reglas del estado: las de RestaurantStatusRules, las mismas de
 * PublishRestaurant y de aprobar un reclamo («reclamada» exige un dueño y
 * «sin reclamar», que no lo tenga; publicar exige marcarla verificada, y una
 * descartada de OpenStreetMap o retirada no se publica).
 */
class RestaurantResource extends AdminResource
{
    protected static ?string $model = Restaurant::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedBuildingStorefront;

    protected static ?int $navigationSort = 1;

    protected static ?string $slug = 'restaurants';

    protected static ?string $recordTitleAttribute = 'name';

    /** Lo que se guarda con fill (lo demás va con forceFill: no es asignable). */
    private const FILLABLE = ['name', 'address'];

    public static function getModelLabel(): string
    {
        return __('panel.admin.restaurants.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.admin.restaurants.plural');
    }

    /** @return array<string, string> */
    public static function statusOptions(): array
    {
        return collect(RestaurantStatus::cases())
            ->mapWithKeys(fn (RestaurantStatus $status): array => [$status->value => (string) __("panel.admin.status.{$status->value}")])
            ->all();
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Section::make(__('panel.admin.restaurants.section_main'))
                ->columns(2)
                ->schema([
                    Fields::text('name', __('panel.profile.name'), 120, required: true),
                    TextInput::make('slug')
                        ->label(__('panel.admin.restaurants.slug'))
                        ->helperText(__('panel.admin.restaurants.slug_help'))
                        ->maxLength(140)
                        ->regex('/^[a-z0-9]+(-[a-z0-9]+)*$/')
                        ->unique(ignoreRecord: true)
                        ->required(fn (string $operation): bool => $operation === 'edit'),
                    Select::make('status')
                        ->label(__('panel.admin.restaurants.status'))
                        ->options(self::statusOptions())
                        ->default(RestaurantStatus::Hidden->value)
                        ->required(),
                    Select::make('plan')
                        ->label(__('panel.admin.restaurants.plan'))
                        ->options(collect(RestaurantPlan::cases())
                            ->mapWithKeys(fn (RestaurantPlan $plan): array => [$plan->value => (string) __("panel.admin.plan.{$plan->value}")])
                            ->all())
                        ->default(RestaurantPlan::Free->value)
                        ->required(),
                    Toggle::make('verified')
                        ->label(__('panel.admin.restaurants.verified'))
                        ->helperText(__('panel.admin.restaurants.verified_help')),
                    Toggle::make('is_fictitious')
                        ->label(__('panel.admin.restaurants.fictitious')),
                ]),
            Section::make(__('panel.admin.restaurants.section_place'))
                ->columns(2)
                ->schema([
                    TextInput::make('latitude')
                        ->label(__('panel.admin.restaurants.latitude'))
                        ->numeric()->minValue(-90)->maxValue(90)->required(),
                    TextInput::make('longitude')
                        ->label(__('panel.admin.restaurants.longitude'))
                        ->numeric()->minValue(-180)->maxValue(180)->required(),
                    Fields::text('address', __('panel.profile.address'), 160),
                    Select::make('categories')
                        ->label(__('panel.admin.restaurants.categories'))
                        ->relationship('categories', 'name_es')
                        ->multiple()
                        ->preload(),
                ]),
        ]);
    }

    /**
     * Lo que la ficha guardada muestra en el formulario.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function fillFormData(Restaurant $restaurant, array $data): array
    {
        /** @var array<string, mixed> $kept */
        $kept = Arr::only($data, [...self::FILLABLE, 'slug', 'is_fictitious']);

        return [
            ...$kept,
            'status' => $restaurant->status->value,
            'plan' => $restaurant->plan->value,
            'verified' => $restaurant->verified_at !== null,
            'latitude' => $restaurant->location->latitude,
            'longitude' => $restaurant->location->longitude,
        ];
    }

    /**
     * Guarda el formulario en la ficha (nueva o existente). El slug, si se
     * deja vacío al crear, sale del nombre. Llamar dentro de una transacción:
     * el estado se comprueba con la fila bloqueada (RestaurantStatusRules) y
     * un estado prohibido es un error del campo «Estado».
     *
     * @param  array<string, mixed>  $data
     *
     * @throws ValidationException
     */
    public static function persist(Restaurant $restaurant, array $data): Restaurant
    {
        $slug = $data['slug'] ?? null;
        $name = $data['name'] ?? '';
        $verified = (bool) ($data['verified'] ?? false);
        $status = RestaurantStatus::from(is_string($data['status'] ?? null) ? $data['status'] : 'hidden');

        $current = $restaurant->exists
            ? Restaurant::query()->lockForUpdate()->whereKey($restaurant->getKey())->firstOrFail()
            : $restaurant;

        try {
            RestaurantStatusRules::assert($current, $status, $verified);
        } catch (ActionRefused $refused) {
            throw ValidationException::withMessages(['data.status' => __("panel.admin.refused.{$refused->reason}")]);
        }

        /** @var array<string, mixed> $fillable */
        $fillable = Arr::only($data, self::FILLABLE);
        $restaurant->fill($fillable);

        $restaurant->forceFill([
            'slug' => is_string($slug) && $slug !== '' ? $slug : RestaurantSlug::unique(is_string($name) ? $name : ''),
            'status' => $status,
            'plan' => RestaurantPlan::from(is_string($data['plan'] ?? null) ? $data['plan'] : 'free'),
            'is_fictitious' => (bool) ($data['is_fictitious'] ?? false),
            'verified_at' => $verified ? ($restaurant->verified_at ?? now()) : null,
            'location' => new GeoPoint(self::number($data['latitude'] ?? null), self::number($data['longitude'] ?? null)),
        ])->save();

        return $restaurant;
    }

    private static function number(mixed $value): float
    {
        return is_numeric($value) ? (float) $value : NAN;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('name')
            ->columns([
                TextColumn::make('name')->label(__('panel.profile.name'))->searchable()->sortable(),
                TextColumn::make('slug')->label(__('panel.admin.restaurants.slug'))->searchable()->toggleable(),
                TextColumn::make('status')
                    ->label(__('panel.admin.restaurants.status'))
                    ->badge()
                    ->formatStateUsing(fn (RestaurantStatus $state): string => self::statusOptions()[$state->value])
                    ->color(fn (RestaurantStatus $state): string => $state === RestaurantStatus::Hidden ? 'gray' : 'success'),
                IconColumn::make('verified_at')->label(__('panel.admin.restaurants.verified'))->boolean()
                    ->getStateUsing(fn (Restaurant $record): bool => $record->verified_at !== null),
                IconColumn::make('is_fictitious')->label(__('panel.admin.restaurants.fictitious'))->boolean()->toggleable(),
                TextColumn::make('updated_by_owner_at')
                    ->label(__('panel.admin.restaurants.owner_updated'))
                    ->dateTime('Y-m-d H:i')
                    ->placeholder('—')
                    ->sortable(),
            ])
            ->filters([
                SelectFilter::make('status')->label(__('panel.admin.restaurants.status'))->options(self::statusOptions()),
                TernaryFilter::make('is_fictitious')->label(__('panel.admin.restaurants.fictitious')),
                TernaryFilter::make('updated_by_owner')
                    ->label(__('panel.admin.restaurants.owner_updated'))
                    ->queries(
                        true: fn (Builder $query) => $query->whereNotNull('updated_by_owner_at'),
                        false: fn (Builder $query) => $query->whereNull('updated_by_owner_at'),
                    ),
            ])
            ->recordActions([
                EditAction::make(),
                Action::make('hide')
                    ->label(__('panel.admin.restaurants.hide'))
                    ->icon(Heroicon::OutlinedEyeSlash)
                    ->color('danger')
                    ->requiresConfirmation()
                    ->modalDescription(__('panel.admin.restaurants.hide_help'))
                    ->visible(fn (Restaurant $record): bool => $record->status->isPublished())
                    ->authorize(fn (Restaurant $record): bool => Gate::allows('update', $record))
                    ->action(fn (Restaurant $record) => self::runAction(
                        fn () => app(HideRestaurant::class)->handle($record),
                        __('panel.admin.restaurants.hidden'),
                    )),
                Action::make('show')
                    ->label(__('panel.admin.restaurants.show'))
                    ->icon(Heroicon::OutlinedEye)
                    ->visible(fn (Restaurant $record): bool => $record->status === RestaurantStatus::Hidden)
                    ->modalSubmitActionLabel(__('panel.admin.restaurants.show'))
                    ->authorize(fn (Restaurant $record): bool => Gate::allows('update', $record))
                    ->schema([
                        Toggle::make('verified_now')
                            ->label(__('panel.admin.drafts.verified_now'))
                            ->helperText(__('panel.admin.restaurants.verified_help')),
                    ])
                    ->action(fn (Restaurant $record, array $data) => self::runAction(
                        fn () => app(PublishRestaurant::class)->handle($record, verifiedNow: (bool) ($data['verified_now'] ?? false)),
                        __('panel.admin.restaurants.published'),
                    )),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListRestaurants::route('/'),
            'create' => CreateRestaurant::route('/create'),
            'edit' => EditRestaurant::route('/{record}/edit'),
        ];
    }
}
