<?php

namespace App\Filament\Owner\Resources\MenuSections;

use App\Filament\Owner\OwnerResource;
use App\Filament\Owner\Resources\MenuSections\Pages\CreateMenuSection;
use App\Filament\Owner\Resources\MenuSections\Pages\EditMenuSection;
use App\Filament\Owner\Resources\MenuSections\Pages\ListMenuSections;
use App\Filament\Owner\Support\Fields;
use App\Models\MenuSection;
use Filament\Actions\EditAction;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/** Secciones del menú («Almuerzos», «Bebidas»), en el orden de position. */
class MenuSectionResource extends OwnerResource
{
    /** Tope por restaurante (OwnerResource::canCreate, ADR 0025). */
    public const int MAX_PER_RESTAURANT = 30;

    protected static ?string $model = MenuSection::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedQueueList;

    protected static ?int $navigationSort = 1;

    protected static ?string $slug = 'menu-sections';

    public static function getModelLabel(): string
    {
        return __('panel.sections.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.sections.plural');
    }

    public static function getNavigationGroup(): ?string
    {
        return __('panel.nav.menu');
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Fields::text('name_es', __('panel.fields.name_es'), 80, required: true),
            Fields::text('name_en', __('panel.fields.name_en'), 80),
            Fields::position(),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('position')
            ->columns([
                TextColumn::make('name_es')->label(__('panel.fields.name'))->searchable(),
                TextColumn::make('dishes_count')->label(__('panel.dishes.plural'))->counts('dishes'),
                TextColumn::make('position')->label(__('panel.fields.position'))->sortable(),
            ])
            ->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListMenuSections::route('/'),
            'create' => CreateMenuSection::route('/create'),
            'edit' => EditMenuSection::route('/{record}/edit'),
        ];
    }
}
