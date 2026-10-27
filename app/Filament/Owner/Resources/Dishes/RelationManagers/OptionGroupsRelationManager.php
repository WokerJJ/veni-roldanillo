<?php

namespace App\Filament\Owner\Resources\Dishes\RelationManagers;

use App\Enums\OptionGroupKind;
use App\Filament\Owner\Concerns\TouchesOwnerUpdate;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use App\Filament\Owner\Support\Fields;
use App\Models\Dish;
use App\Models\OptionGroup;
use Filament\Actions\CreateAction;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Repeater;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Grupos de opciones de un plato (ADR 0023) con sus opciones: elegir
 * (proteína, adiciones con precio) o quitar ingredientes.
 *
 * Reglas (auditoría del #14, comentario en #19): `kind` se valida contra el
 * enum; un grupo de quitar no es obligatorio (mínimo 0); obligatorio si y solo
 * si el mínimo es 1 o más, como el CHECK de la base, así que `required` no se
 * pide: se deriva del mínimo. Topes: MAX_GROUPS grupos por plato y
 * MAX_OPTIONS opciones por grupo, porque todo viaja en las props de la ficha.
 * El mínimo y el máximo no pasan de la cantidad de opciones del grupo; cuentan
 * todas, también las que hoy no están disponibles (la disponibilidad cambia
 * en el día): si con las disponibles no alcanza, la ficha marca el plato «No
 * disponible hoy».
 *
 * Un grupo y sus opciones se guardan juntos o no se guardan: cada acción
 * corre en una transacción y, si la base rechaza algo, el dueño ve el aviso
 * en el formulario (callMountedAction).
 */
class OptionGroupsRelationManager extends RelationManager
{
    use TouchesOwnerUpdate, TranslatesConstraintViolations;

    public const MAX_GROUPS = 10;

    public const MAX_OPTIONS = 30;

    protected static string $relationship = 'optionGroups';

    public static function getTitle(Model $ownerRecord, string $pageClass): string
    {
        return __('panel.groups.plural');
    }

    /** Se ve si el dueño puede editar el plato (RestaurantContentPolicy). */
    public static function canViewForRecord(Model $ownerRecord, string $pageClass): bool
    {
        return $ownerRecord instanceof Dish && Gate::allows('update', $ownerRecord);
    }

    public function form(Schema $schema): Schema
    {
        return $schema->components([
            Select::make('kind')
                ->label(__('panel.groups.kind'))
                ->options([
                    OptionGroupKind::Choice->value => __('panel.groups.kind_choice'),
                    OptionGroupKind::Removal->value => __('panel.groups.kind_removal'),
                ])
                ->default(OptionGroupKind::Choice->value)
                ->rule(Rule::enum(OptionGroupKind::class))
                ->required()
                ->live(),
            Fields::text('name_es', __('panel.fields.name_es'), 80, required: true),
            Fields::text('name_en', __('panel.fields.name_en'), 80),
            TextInput::make('min_choices')
                ->label(__('panel.groups.min'))
                ->helperText(__('panel.groups.min_help'))
                ->integer()
                ->required()
                ->default(0)
                ->minValue(0)
                // Un grupo de quitar nunca es obligatorio.
                ->maxValue(fn (Get $get): int => $get('kind') === OptionGroupKind::Removal->value ? 0 : self::optionsCount($get)),
            TextInput::make('max_choices')
                ->label(__('panel.groups.max'))
                ->integer()
                ->required()
                ->default(1)
                ->minValue(1)
                ->maxValue(fn (Get $get): int => max(1, self::optionsCount($get)))
                ->gte('min_choices'),
            Fields::position(),
            Repeater::make('options')
                ->label(__('panel.options.plural'))
                ->relationship('options')
                ->orderColumn('position')
                ->minItems(1)
                ->maxItems(self::MAX_OPTIONS)
                ->addActionLabel(__('panel.options.add'))
                ->columns(3)
                ->columnSpanFull()
                ->schema([
                    Fields::text('name_es', __('panel.fields.name_es'), 80, required: true),
                    Fields::text('name_en', __('panel.fields.name_en'), 80),
                    Fields::pesos('price_delta', __('panel.options.price_delta'), 500_000)->default(0),
                    Toggle::make('available')->label(__('panel.options.available'))->default(true),
                ]),
        ]);
    }

    public function table(Table $table): Table
    {
        return $table
            // La autorización de cada fila sigue grupo → plato → restaurante
            // sin consultar por fila (owningRestaurant usa lo cargado aquí).
            ->modifyQueryUsing(fn (Builder $query): Builder => $query->with('dish.restaurant'))
            ->defaultSort('position')
            ->columns([
                TextColumn::make('name_es')->label(__('panel.fields.name')),
                TextColumn::make('kind')
                    ->label(__('panel.groups.kind'))
                    ->formatStateUsing(fn (OptionGroupKind $state): string => __("panel.groups.kind_{$state->value}")),
                TextColumn::make('min_choices')->label(__('panel.groups.min')),
                TextColumn::make('max_choices')->label(__('panel.groups.max')),
                TextColumn::make('options_count')->label(__('panel.options.plural'))->counts('options'),
            ])
            ->headerActions([
                CreateAction::make()
                    ->authorize(fn (): bool => $this->dish()->optionGroups()->count() < self::MAX_GROUPS
                        && Gate::allows('update', $this->dish()))
                    ->databaseTransaction()
                    ->mutateDataUsing(fn (array $data): array => self::withRequired($data))
                    ->after(fn () => $this->touchOwnerUpdate()),
            ])
            ->recordActions([
                EditAction::make()
                    ->authorize(fn (OptionGroup $record): bool => Gate::allows('update', $record))
                    ->databaseTransaction()
                    ->mutateDataUsing(fn (array $data): array => self::withRequired($data))
                    ->after(fn () => $this->touchOwnerUpdate()),
                DeleteAction::make()
                    ->authorize(fn (OptionGroup $record): bool => Gate::allows('delete', $record))
                    ->using(function (OptionGroup $record): bool {
                        $deleted = $this->deleteRespectingConstraints($record);

                        if ($deleted) {
                            $this->touchOwnerUpdate();
                        }

                        return $deleted;
                    })
                    ->failureNotificationTitle(__('panel.errors.delete_blocked')),
            ]);
    }

    /**
     * Toda acción del gestor (crear, editar, borrar) corre dentro de
     * writeRespectingConstraints: el grupo y sus opciones (el repetidor se
     * guarda después del grupo) van en una sola transacción, y lo que la
     * base rechace se avisa en el formulario, no como error 500.
     *
     * @param  array<string, mixed>  $arguments
     */
    public function callMountedAction(array $arguments = []): mixed
    {
        return $this->writeRespectingConstraints(fn (): mixed => parent::callMountedAction($arguments));
    }

    /** El aviso va en el nombre del grupo, en el formulario abierto. */
    protected function constraintErrorField(?string $constraint): ?string
    {
        $statePath = $this->getMountedActionSchema()?->getStatePath();

        return $statePath === null ? null : "{$statePath}.name_es";
    }

    /** Cuántas opciones tiene el repetidor del formulario. */
    private static function optionsCount(Get $get): int
    {
        $options = $get('options');

        return min(self::MAX_OPTIONS, is_array($options) ? count($options) : 0);
    }

    /**
     * Obligatorio si y solo si hay que elegir al menos una (el CHECK
     * option_groups_choices_range); un grupo de quitar, nunca.
     *
     * @param  array<mixed>  $data
     * @return array<mixed>
     */
    public static function withRequired(array $data): array
    {
        if (($data['kind'] ?? null) === OptionGroupKind::Removal->value) {
            $data['min_choices'] = 0;
        }

        $min = $data['min_choices'] ?? 0;
        $data['required'] = is_numeric($min) && (int) $min >= 1;

        return $data;
    }

    private function dish(): Dish
    {
        $dish = $this->getOwnerRecord();
        abort_unless($dish instanceof Dish, 404);

        return $dish;
    }
}
