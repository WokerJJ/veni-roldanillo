<?php

namespace App\Filament\Admin\Resources\Catalog;

use App\Filament\Admin\AdminResource;
use App\Filament\Admin\Resources\Catalog\Pages\CreateCatalogGroup;
use App\Filament\Admin\Resources\Catalog\Pages\EditCatalogGroup;
use App\Filament\Admin\Resources\Catalog\Pages\ListCatalogGroups;
use App\Models\CatalogGroup;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/**
 * Los grupos del catálogo del modo Campo (ADR 0050): gaseosas, cervezas,
 * jugos naturales… Cada uno dice qué sección del menú crea al aprobar una
 * captura. Se desactivan, no se borran.
 */
class CatalogGroupResource extends AdminResource
{
    protected static ?string $model = CatalogGroup::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedRectangleGroup;

    protected static ?int $navigationSort = 5;

    protected static ?string $slug = 'catalog-groups';

    protected static ?string $recordTitleAttribute = 'name_es';

    public static function getModelLabel(): string
    {
        return __('panel.admin.catalog.group_label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.admin.catalog.group_plural');
    }

    public static function getTitleCasePluralModelLabel(): string
    {
        return static::getPluralModelLabel();
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Section::make()->columns(2)->schema([
                TextInput::make('name_es')->label(__('panel.admin.catalog.name_es'))->required()->maxLength(80),
                TextInput::make('name_en')->label(__('panel.admin.catalog.name_en'))->maxLength(80),
                TextInput::make('section_name_es')
                    ->label(__('panel.admin.catalog.section_es'))
                    ->helperText(__('panel.admin.catalog.section_help'))
                    ->required()->maxLength(80),
                TextInput::make('section_name_en')->label(__('panel.admin.catalog.section_en'))->maxLength(80),
                TextInput::make('slug')
                    ->label(__('panel.admin.catalog.slug'))
                    ->required()->maxLength(60)
                    ->regex('/^[a-z0-9]+(-[a-z0-9]+)*$/')
                    ->unique(ignoreRecord: true),
                TextInput::make('position')->label(__('panel.admin.catalog.position'))->numeric()->integer()->minValue(0)->maxValue(1000)->default(0),
                Toggle::make('is_alcohol')
                    ->label(__('panel.admin.catalog.alcohol'))
                    ->helperText(__('panel.admin.catalog.alcohol_help')),
                Toggle::make('active')->label(__('panel.admin.catalog.active'))->default(true),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('position')
            ->columns([
                TextColumn::make('name_es')->label(__('panel.admin.catalog.name_es'))->searchable(),
                TextColumn::make('section_name_es')->label(__('panel.admin.catalog.section_es')),
                TextColumn::make('items_count')->label(__('panel.admin.catalog.items'))->counts('items'),
                IconColumn::make('is_alcohol')->label(__('panel.admin.catalog.alcohol'))->boolean(),
                IconColumn::make('active')->label(__('panel.admin.catalog.active'))->boolean(),
            ])
            ->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListCatalogGroups::route('/'),
            'create' => CreateCatalogGroup::route('/create'),
            'edit' => EditCatalogGroup::route('/{record}/edit'),
        ];
    }
}
