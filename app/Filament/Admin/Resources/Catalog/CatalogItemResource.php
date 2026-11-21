<?php

namespace App\Filament\Admin\Resources\Catalog;

use App\Filament\Admin\AdminResource;
use App\Filament\Admin\Resources\Catalog\Pages\CreateCatalogItem;
use App\Filament\Admin\Resources\Catalog\Pages\EditCatalogItem;
use App\Filament\Admin\Resources\Catalog\Pages\ListCatalogItems;
use App\Models\CatalogGroup;
use App\Models\CatalogItem;
use Closure;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Repeater;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Los productos del catálogo del modo Campo y sus presentaciones (ADR 0050):
 * administración los mantiene y viajan a `/campo` para armar una carta sin
 * teclear cada bebida. Solo texto: los nombres como los vende el restaurante,
 * nunca logos ni imágenes de marca. Se desactivan, no se borran.
 */
class CatalogItemResource extends AdminResource
{
    protected static ?string $model = CatalogItem::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedShoppingBag;

    protected static ?int $navigationSort = 6;

    protected static ?string $slug = 'catalog-items';

    protected static ?string $recordTitleAttribute = 'name_es';

    public static function getModelLabel(): string
    {
        return __('panel.admin.catalog.item_label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.admin.catalog.item_plural');
    }

    public static function getTitleCasePluralModelLabel(): string
    {
        return static::getPluralModelLabel();
    }

    /** @return Builder<CatalogItem> */
    public static function getEloquentQuery(): Builder
    {
        /** @var Builder<CatalogItem> $query */
        $query = parent::getEloquentQuery();

        return $query->with('group:id,name_es')->withCount('variants');
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Section::make()->columns(2)->schema([
                Select::make('group_id')
                    ->label(__('panel.admin.catalog.group_label'))
                    ->options(fn (): array => CatalogGroup::query()->orderBy('position')->pluck('name_es', 'id')->all())
                    ->required(),
                TextInput::make('brand')
                    ->label(__('panel.admin.catalog.brand'))
                    ->helperText(__('panel.admin.catalog.brand_help'))
                    ->maxLength(60),
                TextInput::make('name_es')
                    ->label(__('panel.admin.catalog.name_es'))
                    ->required()->maxLength(100)
                    ->rules([
                        fn (Get $get, ?Model $record): Closure => function (string $attribute, mixed $value, Closure $fail) use ($get, $record): void {
                            $brand = $get('brand');
                            $taken = CatalogItem::query()
                                ->where('group_id', $get('group_id'))
                                // Lo mismo que el índice único de la base: sin mayúsculas ni espacios de más.
                                ->whereRaw("coalesce(lower(btrim(brand)), '') = lower(btrim(?))", [is_string($brand) ? $brand : ''])
                                ->whereRaw('lower(btrim(name_es)) = lower(btrim(?))', [is_string($value) ? $value : ''])
                                ->when($record instanceof Model, fn (Builder $query) => $query->whereKeyNot($record?->getKey()))
                                ->exists();

                            if ($taken) {
                                $fail((string) __('panel.admin.catalog.item_taken'));
                            }
                        },
                    ]),
                TextInput::make('name_en')->label(__('panel.admin.catalog.name_en'))->maxLength(100),
                TextInput::make('position')->label(__('panel.admin.catalog.position'))->numeric()->integer()->minValue(0)->maxValue(1000)->default(0),
                Toggle::make('is_alcohol')
                    ->label(__('panel.admin.catalog.alcohol'))
                    ->helperText(__('panel.admin.catalog.alcohol_help')),
                Toggle::make('active')->label(__('panel.admin.catalog.active'))->default(true),
            ]),
            Section::make(__('panel.admin.catalog.variants'))->schema([
                Repeater::make('variants')
                    ->relationship()
                    ->label(__('panel.admin.catalog.variants'))
                    ->helperText(__('panel.admin.catalog.variants_help'))
                    ->orderColumn('position')
                    ->defaultItems(0)
                    ->maxItems(12)
                    ->addActionLabel(__('panel.admin.catalog.add_variant'))
                    ->schema([
                        TextInput::make('label')->label(__('panel.admin.catalog.variant'))->required()->maxLength(40)
                            ->rules([
                                // Como el índice de la base: «400 ml» y « 400 ML » son la misma presentación.
                                fn (TextInput $component): Closure => function (string $attribute, mixed $value, Closure $fail) use ($component): void {
                                    $normalize = fn (mixed $label): string => mb_strtolower(trim(is_string($label) ? $label : ''));
                                    $variants = $component->getParentRepeater()?->getRawState();
                                    $labels = collect(is_array($variants) ? $variants : [])
                                        ->map(fn (mixed $variant): string => $normalize(is_array($variant) ? ($variant['label'] ?? null) : null));

                                    if ($labels->filter(fn (string $label): bool => $label === $normalize($value))->count() > 1) {
                                        $fail((string) __('panel.admin.catalog.variant_taken'));
                                    }
                                },
                            ]),
                        Toggle::make('active')->label(__('panel.admin.catalog.active'))->default(true),
                    ])
                    ->columns(2),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('group_id')
            ->columns([
                TextColumn::make('group.name_es')->label(__('panel.admin.catalog.group_label'))->sortable(),
                TextColumn::make('brand')->label(__('panel.admin.catalog.brand'))->placeholder('—')->searchable(),
                TextColumn::make('name_es')->label(__('panel.admin.catalog.name_es'))->searchable(),
                TextColumn::make('variants_count')->label(__('panel.admin.catalog.variants')),
                IconColumn::make('is_alcohol')->label(__('panel.admin.catalog.alcohol'))->boolean(),
                IconColumn::make('active')->label(__('panel.admin.catalog.active'))->boolean(),
            ])
            ->filters([
                SelectFilter::make('group_id')
                    ->label(__('panel.admin.catalog.group_label'))
                    ->options(fn (): array => CatalogGroup::query()->orderBy('position')->pluck('name_es', 'id')->all()),
                TernaryFilter::make('is_alcohol')->label(__('panel.admin.catalog.alcohol')),
                TernaryFilter::make('active')->label(__('panel.admin.catalog.active')),
            ])
            ->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListCatalogItems::route('/'),
            'create' => CreateCatalogItem::route('/create'),
            'edit' => EditCatalogItem::route('/{record}/edit'),
        ];
    }
}
