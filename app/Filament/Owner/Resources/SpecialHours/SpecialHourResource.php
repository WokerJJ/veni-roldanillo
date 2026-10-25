<?php

namespace App\Filament\Owner\Resources\SpecialHours;

use App\Filament\Owner\OwnerResource;
use App\Filament\Owner\Resources\SpecialHours\Pages\CreateSpecialHour;
use App\Filament\Owner\Resources\SpecialHours\Pages\EditSpecialHour;
use App\Filament\Owner\Resources\SpecialHours\Pages\ListSpecialHours;
use App\Filament\Owner\Support\Fields;
use App\Models\SpecialHour;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\TimePicker;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/**
 * Horarios especiales y cierres de un día (festivos, cierre temporal):
 * cerrado sin horas, o abierto con las dos, como exige la base.
 */
class SpecialHourResource extends OwnerResource
{
    protected static ?string $model = SpecialHour::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedCalendarDays;

    protected static ?int $navigationSort = 5;

    protected static ?string $slug = 'special-hours';

    public static function getModelLabel(): string
    {
        return __('panel.special.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.special.plural');
    }

    public static function getNavigationGroup(): ?string
    {
        return __('panel.nav.hours');
    }

    public static function constraintErrorField(): string
    {
        return 'data.on_date';
    }

    public static function form(Schema $schema): Schema
    {
        $open = fn (Get $get): bool => ! $get('closed');

        return $schema->components([
            DatePicker::make('on_date')->label(__('panel.special.on_date'))->required(),
            Toggle::make('closed')->label(__('panel.special.closed'))->default(false)->live(),
            TimePicker::make('opens_at')->label(__('panel.hours.opens_at'))->seconds(false)
                ->visible($open)->required($open),
            TimePicker::make('closes_at')->label(__('panel.hours.closes_at'))->seconds(false)
                ->visible($open)->required($open),
            Fields::text('note_es', __('panel.special.note_es'), 160),
            Fields::text('note_en', __('panel.special.note_en'), 160),
        ]);
    }

    /**
     * Cerrado no lleva horas.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function mutateFormData(array $data): array
    {
        $data['closed'] = (bool) ($data['closed'] ?? false);

        if ($data['closed']) {
            $data['opens_at'] = null;
            $data['closes_at'] = null;
        }

        return $data;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('on_date', 'desc')
            ->columns([
                TextColumn::make('on_date')->label(__('panel.special.on_date'))->date('Y-m-d'),
                IconColumn::make('closed')->label(__('panel.special.closed'))->boolean(),
                TextColumn::make('opens_at')->label(__('panel.hours.opens_at'))->time('H:i'),
                TextColumn::make('closes_at')->label(__('panel.hours.closes_at'))->time('H:i'),
                TextColumn::make('note_es')->label(__('panel.special.note')),
            ])
            ->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListSpecialHours::route('/'),
            'create' => CreateSpecialHour::route('/create'),
            'edit' => EditSpecialHour::route('/{record}/edit'),
        ];
    }
}
