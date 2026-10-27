<?php

namespace App\Filament\Admin\Resources\OsmDrafts;

use App\Actions\Restaurants\DismissOsmDraft;
use App\Actions\Restaurants\PublishRestaurant;
use App\Enums\RestaurantStatus;
use App\Filament\Admin\AdminResource;
use App\Filament\Admin\Resources\OsmDrafts\Pages\ListOsmDrafts;
use App\Filament\Admin\Resources\Restaurants\RestaurantResource;
use App\Models\Restaurant;
use App\Models\RestaurantSource;
use App\Support\Osm\OsmPlace;
use Filament\Actions\Action;
use Filament\Forms\Components\Toggle;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;

/**
 * Borradores de OpenStreetMap (ADR 0021 y 0027): las fichas importadas que
 * siguen ocultas y no se descartaron, para el recorrido. Publicar
 * (PublishRestaurant, exige confirmar que se verificó en la calle) y
 * descartar (DismissOsmDraft) son las mismas acciones de `veni:publish` y
 * `veni:osm-dismiss`. Corregir el nombre, el punto o la categoría antes de
 * publicar se hace en la ficha (RestaurantResource).
 */
class OsmDraftResource extends AdminResource
{
    protected static ?string $model = Restaurant::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedMap;

    protected static ?int $navigationSort = 2;

    protected static ?string $slug = 'osm-drafts';

    public static function getModelLabel(): string
    {
        return __('panel.admin.drafts.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.admin.drafts.plural');
    }

    public static function canCreate(): bool
    {
        return false;
    }

    /** @return Builder<Restaurant> */
    public static function getEloquentQuery(): Builder
    {
        /** @var Builder<Restaurant> $query */
        $query = parent::getEloquentQuery();

        return $query
            ->where('status', RestaurantStatus::Hidden->value)
            ->whereHas('source', fn (Builder $source) => $source
                ->where('source', RestaurantSource::OPENSTREETMAP)
                ->whereNull('dismissed_at'))
            ->with(['source', 'categories']);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('name')
            ->columns([
                TextColumn::make('name')->label(__('panel.profile.name'))->searchable()->sortable(),
                TextColumn::make('source.element_kind')
                    ->label(__('panel.admin.drafts.kind'))
                    ->formatStateUsing(fn (string $state): string => OsmPlace::label($state)),
                TextColumn::make('categories.name_es')->label(__('panel.admin.restaurants.categories'))->badge(),
                TextColumn::make('source.missing_since')
                    ->label(__('panel.admin.drafts.missing_since'))
                    ->date('Y-m-d')
                    ->placeholder('—'),
            ])
            ->recordUrl(null)
            ->recordActions([
                Action::make('osm')
                    ->label(__('panel.admin.drafts.open_osm'))
                    ->icon(Heroicon::OutlinedArrowTopRightOnSquare)
                    ->color('gray')
                    ->url(fn (Restaurant $record): ?string => self::source($record)?->url(), shouldOpenInNewTab: true),
                Action::make('edit')
                    ->label(__('panel.admin.drafts.edit'))
                    ->icon(Heroicon::OutlinedPencilSquare)
                    ->color('gray')
                    ->url(fn (Restaurant $record): string => RestaurantResource::getUrl('edit', ['record' => $record])),
                Action::make('publish')
                    ->label(__('panel.admin.drafts.publish'))
                    ->icon(Heroicon::OutlinedCheckCircle)
                    ->color('success')
                    ->modalSubmitActionLabel(__('panel.admin.drafts.publish'))
                    ->authorize(fn (Restaurant $record): bool => Gate::allows('update', $record))
                    ->schema([
                        Toggle::make('verified_now')
                            ->label(__('panel.admin.drafts.verified_now'))
                            ->helperText(__('panel.admin.restaurants.verified_help'))
                            ->accepted(),
                    ])
                    ->action(fn (Restaurant $record) => self::runAction(
                        fn () => app(PublishRestaurant::class)->handle($record, verifiedNow: true),
                        __('panel.admin.restaurants.published'),
                    )),
                Action::make('dismiss')
                    ->label(__('panel.admin.drafts.dismiss'))
                    ->icon(Heroicon::OutlinedXCircle)
                    ->color('danger')
                    ->requiresConfirmation()
                    ->modalDescription(__('panel.admin.drafts.dismiss_help'))
                    ->authorize(fn (Restaurant $record): bool => Gate::allows('update', $record))
                    ->action(fn (Restaurant $record) => self::runAction(
                        fn () => app(DismissOsmDraft::class)->handle($record),
                        __('panel.admin.drafts.dismissed'),
                    )),
            ]);
    }

    private static function source(Restaurant $restaurant): ?RestaurantSource
    {
        return $restaurant->source;
    }

    public static function getPages(): array
    {
        return [
            'index' => ListOsmDrafts::route('/'),
        ];
    }
}
