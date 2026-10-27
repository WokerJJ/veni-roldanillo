<?php

namespace App\Filament\Owner\Resources\OpeningHours;

use App\Filament\Owner\OwnerResource;
use App\Filament\Owner\Resources\OpeningHours\Pages\CreateOpeningHour;
use App\Filament\Owner\Resources\OpeningHours\Pages\EditOpeningHour;
use App\Filament\Owner\Resources\OpeningHours\Pages\ListOpeningHours;
use App\Models\OpeningHour;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TimePicker;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/**
 * Horario semanal: franjas por día (0 = domingo). Una franja puede pasar la
 * medianoche (cierra a las 02:00). Que dos franjas del mismo día no se pisen
 * lo asegura el EXCLUDE de la base; si pasa, el formulario lo avisa en la
 * hora de apertura (TranslatesConstraintViolations).
 */
class OpeningHourResource extends OwnerResource
{
    protected static ?string $model = OpeningHour::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedClock;

    protected static ?int $navigationSort = 4;

    protected static ?string $slug = 'opening-hours';

    public static function getModelLabel(): string
    {
        return __('panel.hours.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.hours.plural');
    }

    public static function getNavigationGroup(): ?string
    {
        return __('panel.nav.hours');
    }

    public static function constraintErrorField(): string
    {
        return 'data.opens_at';
    }

    /**
     * De lunes a domingo.
     *
     * @return array<int, string>
     */
    public static function weekdays(): array
    {
        return collect([1, 2, 3, 4, 5, 6, 0])
            ->mapWithKeys(fn (int $day): array => [$day => __("panel.weekdays.{$day}")])
            ->all();
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Select::make('weekday')->label(__('panel.hours.weekday'))->options(self::weekdays())->in(range(0, 6))->required(),
            TimePicker::make('opens_at')->label(__('panel.hours.opens_at'))->seconds(false)->required(),
            TimePicker::make('closes_at')
                ->label(__('panel.hours.closes_at'))
                ->helperText(__('panel.hours.closes_help'))
                ->seconds(false)
                ->required()
                ->different('opens_at'),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort(fn (Builder $query): Builder => $query->orderByRaw('(weekday + 6) % 7')->orderBy('opens_at'))
            ->columns([
                TextColumn::make('weekday')->label(__('panel.hours.weekday'))
                    ->formatStateUsing(fn (int $state): string => __("panel.weekdays.{$state}")),
                TextColumn::make('opens_at')->label(__('panel.hours.opens_at'))->time('H:i'),
                TextColumn::make('closes_at')->label(__('panel.hours.closes_at'))->time('H:i'),
            ])
            ->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListOpeningHours::route('/'),
            'create' => CreateOpeningHour::route('/create'),
            'edit' => EditOpeningHour::route('/{record}/edit'),
        ];
    }
}
