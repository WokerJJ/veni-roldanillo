<?php

namespace App\Filament\Owner\Resources\MenuSections;

use App\Filament\Owner\OwnerResource;
use App\Filament\Owner\Resources\MenuSections\Pages\CreateMenuSection;
use App\Filament\Owner\Resources\MenuSections\Pages\EditMenuSection;
use App\Filament\Owner\Resources\MenuSections\Pages\ListMenuSections;
use App\Filament\Owner\Support\Fields;
use App\Models\MenuSection;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Components\Utilities\Set;
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
            self::proposingPriceRange(Fields::text('name_es', __('panel.fields.name_es'), 80, required: true)),
            self::proposingPriceRange(Fields::text('name_en', __('panel.fields.name_en'), 80)),
            Fields::position(),
            Toggle::make('counts_for_price_range')
                ->label(__('panel.sections.counts_for_price_range'))
                ->helperText(__('panel.sections.counts_for_price_range_help'))
                ->default(true),
        ]);
    }

    /**
     * Al crear, el nombre propone la casilla del rango de precios
     * (MenuSection::countsForPriceRangeByName, ADR 0039): «Bebidas» la
     * apaga. Solo mientras la casilla siga como la propuso el nombre
     * anterior: si el dueño la cambió a mano, su elección queda. Al editar no
     * se toca: cambiar el nombre no cambia lo que el dueño ya decidió.
     */
    private static function proposingPriceRange(TextInput $name): TextInput
    {
        return $name
            ->live(onBlur: true)
            ->afterStateUpdated(function (Get $get, Set $set, ?string $old, string $operation, TextInput $component): void {
                if ($operation !== 'create') {
                    return;
                }

                $names = ['name_es' => $get('name_es'), 'name_en' => $get('name_en')];
                $previous = [...$names, $component->getName() => $old];
                $proposed = fn (array $names): bool => MenuSection::countsForPriceRangeByName(
                    is_string($names['name_es']) ? $names['name_es'] : null,
                    is_string($names['name_en']) ? $names['name_en'] : null,
                );

                if ($get('counts_for_price_range') === $proposed($previous)) {
                    $set('counts_for_price_range', $proposed($names));
                }
            });
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
