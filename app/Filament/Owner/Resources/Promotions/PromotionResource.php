<?php

namespace App\Filament\Owner\Resources\Promotions;

use App\Filament\Owner\OwnerResource;
use App\Filament\Owner\Resources\Promotions\Pages\CreatePromotion;
use App\Filament\Owner\Resources\Promotions\Pages\EditPromotion;
use App\Filament\Owner\Resources\Promotions\Pages\ListPromotions;
use App\Filament\Owner\Support\Fields;
use App\Models\Promotion;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/** Promociones por fechas: valen de starts_at a ends_at. */
class PromotionResource extends OwnerResource
{
    /** Tope por restaurante (OwnerResource::canCreate, ADR 0025). */
    public const int MAX_PER_RESTAURANT = 20;

    protected static ?string $model = Promotion::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedMegaphone;

    protected static ?int $navigationSort = 3;

    protected static ?string $slug = 'promotions';

    public static function getModelLabel(): string
    {
        return __('panel.promotions.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.promotions.plural');
    }

    public static function constraintErrorField(): string
    {
        return 'data.ends_at';
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Fields::text('title_es', __('panel.promotions.title_es'), 120, required: true),
            Fields::text('title_en', __('panel.promotions.title_en'), 120),
            DateTimePicker::make('starts_at')->label(__('panel.promotions.starts_at'))->seconds(false)->required(),
            DateTimePicker::make('ends_at')->label(__('panel.promotions.ends_at'))->seconds(false)->required()->after('starts_at'),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('starts_at', 'desc')
            ->columns([
                TextColumn::make('title_es')->label(__('panel.promotions.title')),
                TextColumn::make('starts_at')->label(__('panel.promotions.starts_at'))->dateTime('Y-m-d H:i'),
                TextColumn::make('ends_at')->label(__('panel.promotions.ends_at'))->dateTime('Y-m-d H:i'),
            ])
            ->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListPromotions::route('/'),
            'create' => CreatePromotion::route('/create'),
            'edit' => EditPromotion::route('/{record}/edit'),
        ];
    }
}
