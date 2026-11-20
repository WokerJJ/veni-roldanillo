<?php

namespace App\Filament\Admin\Resources\FieldSubmissions;

use App\Actions\Restaurants\ApproveFieldSubmission;
use App\Actions\Restaurants\CloseFieldSubmission;
use App\Enums\FieldSubmissionStatus;
use App\Filament\Admin\AdminResource;
use App\Filament\Admin\Resources\FieldSubmissions\Pages\ListFieldSubmissions;
use App\Models\Category;
use App\Models\FieldSubmission;
use App\Models\User;
use App\Support\Field\ConfirmationMessage;
use App\Support\Field\DuplicateFinder;
use Filament\Actions\Action;
use Filament\Forms\Components\CheckboxList;
use Filament\Forms\Components\Textarea;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;

/**
 * Capturas de campo (ADR 0048): lo que el administrador levantó en un local y
 * espera una decisión. Aprobar (ApproveFieldSubmission) exige la confirmación
 * del dueño y crea la ficha OCULTA y verificada; se publica aparte, desde
 * «Fichas». El contenido no se edita aquí: si algo está mal se devuelve, así
 * lo que el dueño confirmó es exactamente lo que se aprueba.
 */
class FieldSubmissionResource extends AdminResource
{
    protected static ?string $model = FieldSubmission::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedClipboardDocumentCheck;

    protected static ?int $navigationSort = 4;

    protected static ?string $slug = 'field-submissions';

    public static function getModelLabel(): string
    {
        return __('panel.admin.field.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.admin.field.plural');
    }

    /** El título de la página con el plural tal cual, sin mayúsculas en cada palabra. */
    public static function getTitleCasePluralModelLabel(): string
    {
        return static::getPluralModelLabel();
    }

    public static function canCreate(): bool
    {
        return false;
    }

    /** @return Builder<FieldSubmission> */
    public static function getEloquentQuery(): Builder
    {
        /** @var Builder<FieldSubmission> $query */
        $query = parent::getEloquentQuery();

        return $query->with('capturer:id,name');
    }

    /** Las confirmadas por el dueño, listas para revisar, en el menú. */
    public static function getNavigationBadge(): ?string
    {
        $ready = FieldSubmission::query()->where('status', FieldSubmissionStatus::OwnerConfirmed->value)->count();

        return $ready > 0 ? (string) $ready : null;
    }

    /** @return array<string, string> */
    private static function statusOptions(): array
    {
        return collect(FieldSubmissionStatus::cases())
            ->mapWithKeys(fn (FieldSubmissionStatus $status): array => [$status->value => (string) __("panel.admin.field.status_{$status->value}")])
            ->all();
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('received_at', 'desc')
            ->columns([
                TextColumn::make('received_at')->label(__('panel.admin.field.received'))->dateTime('Y-m-d H:i')->sortable(),
                TextColumn::make('payload.name')->label(__('panel.admin.field.name'))->searchable(),
                TextColumn::make('capturer.name')->label(__('panel.admin.field.captured_by')),
                TextColumn::make('owner_name')
                    ->label(__('panel.admin.field.owner'))
                    ->description(fn (FieldSubmission $record): string => $record->owner_phone)
                    ->url(fn (FieldSubmission $record): string => "https://wa.me/{$record->owner_phone}", shouldOpenInNewTab: true),
                IconColumn::make('owner_confirmed_at')
                    ->label(__('panel.admin.field.owner_confirmed'))
                    ->boolean()
                    ->state(fn (FieldSubmission $record): bool => $record->owner_confirmed_at !== null),
                TextColumn::make('duplicates')
                    ->label(__('panel.admin.field.duplicates'))
                    ->state(fn (FieldSubmission $record): int => count($record->duplicates['candidates'] ?? []))
                    ->badge()
                    ->color(fn (int $state): string => $state > 0 ? 'warning' : 'gray'),
                TextColumn::make('status')
                    ->label(__('panel.admin.field.status'))
                    ->badge()
                    ->formatStateUsing(fn (FieldSubmissionStatus $state): string => self::statusOptions()[$state->value])
                    ->color(fn (FieldSubmissionStatus $state): string => match ($state) {
                        FieldSubmissionStatus::Submitted => 'warning',
                        FieldSubmissionStatus::OwnerConfirmed => 'info',
                        FieldSubmissionStatus::Approved => 'success',
                        FieldSubmissionStatus::Returned, FieldSubmissionStatus::Rejected => 'gray',
                    }),
                TextColumn::make('review_note')->label(__('panel.admin.field.note'))->placeholder('—')->wrap()->toggleable(),
            ])
            ->filters([
                SelectFilter::make('status')
                    ->label(__('panel.admin.field.status'))
                    ->options(['open' => (string) __('panel.admin.field.status_open'), ...self::statusOptions()])
                    ->default('open')
                    ->query(fn (Builder $query, array $data): Builder => match ($data['value'] ?? null) {
                        null, '' => $query,
                        'open' => $query->whereIn('status', [FieldSubmissionStatus::Submitted->value, FieldSubmissionStatus::OwnerConfirmed->value]),
                        default => $query->where('status', $data['value']),
                    }),
            ])
            ->recordUrl(null)
            ->recordActions([
                Action::make('view')
                    ->label(__('panel.admin.field.view'))
                    ->icon(Heroicon::OutlinedEye)
                    ->color('gray')
                    ->modalHeading(fn (FieldSubmission $record): string => $record->payload['name'])
                    ->modalSubmitAction(false)
                    ->modalCancelActionLabel(__('filament-actions::view.single.modal.actions.close.label'))
                    ->modalContent(fn (FieldSubmission $record): View => self::details($record)),
                Action::make('approve')
                    ->label(__('panel.admin.field.approve'))
                    ->icon(Heroicon::OutlinedCheck)
                    ->color('success')
                    ->visible(fn (FieldSubmission $record): bool => $record->status === FieldSubmissionStatus::OwnerConfirmed)
                    ->authorize(fn (FieldSubmission $record): bool => Gate::allows('review', $record))
                    ->modalDescription(__('panel.admin.field.approve_help'))
                    ->modalSubmitActionLabel(__('panel.admin.field.approve'))
                    ->schema(fn (FieldSubmission $record): array => self::duplicatesChoice($record))
                    ->action(fn (FieldSubmission $record, array $data) => self::runAction(
                        fn (User $admin) => app(ApproveFieldSubmission::class)->handle(
                            $record, $admin, array_values(array_map(fn (mixed $id): int => is_numeric($id) ? (int) $id : 0, is_array($data['distinct_from'] ?? null) ? $data['distinct_from'] : [])),
                        ),
                        __('panel.admin.field.approved'),
                    )),
                self::closeAction('send_back', Heroicon::OutlinedArrowUturnLeft, 'warning', 'sent_back', 'sendBack')
                    ->modalDescription(__('panel.admin.field.send_back_help')),
                self::closeAction('reject', Heroicon::OutlinedXMark, 'danger', 'rejected', 'reject'),
            ]);
    }

    /**
     * Devolver y rechazar: los dos piden un motivo y la captura tiene que seguir abierta.
     *
     * @param  'sendBack'|'reject'  $method
     */
    private static function closeAction(string $name, Heroicon $icon, string $color, string $done, string $method): Action
    {
        return Action::make($name)
            ->label(__("panel.admin.field.{$name}"))
            ->icon($icon)
            ->color($color)
            ->modalSubmitActionLabel(__("panel.admin.field.{$name}"))
            ->visible(fn (FieldSubmission $record): bool => $record->status->isOpen())
            ->authorize(fn (FieldSubmission $record): bool => Gate::allows('review', $record))
            ->schema([
                Textarea::make('note')
                    ->label(__('panel.admin.field.note'))
                    ->helperText(__('panel.admin.field.note_help'))
                    ->required()
                    ->maxLength(CloseFieldSubmission::NOTE_MAX),
            ])
            ->action(fn (FieldSubmission $record, array $data) => self::runAction(
                fn (User $admin) => app(CloseFieldSubmission::class)->{$method}($record, $admin, is_string($data['note'] ?? null) ? $data['note'] : ''),
                __("panel.admin.field.{$done}"),
            ));
    }

    /**
     * Las fichas que se parecen a la captura (nombre o 50 m): hay que decir
     * que son otro negocio para aprobar. Se buscan de nuevo al abrir.
     *
     * @return list<CheckboxList>
     */
    private static function duplicatesChoice(FieldSubmission $record): array
    {
        $options = [];

        foreach (app(DuplicateFinder::class)->find($record->payload['name'], $record->location, $record->restaurant_id, $record->uuid) as $candidate) {
            if ($candidate['kind'] === 'restaurant' && $candidate['restaurant_id'] !== null) {
                $options[$candidate['restaurant_id']] = (string) __('panel.admin.field.candidate', [
                    'name' => $candidate['name'], 'status' => $candidate['status'], 'distance' => $candidate['distance_m'],
                ]);
            }
        }

        if ($options === []) {
            return [];
        }

        return [
            CheckboxList::make('distinct_from')
                ->label(__('panel.admin.field.distinct_from'))
                ->helperText(__('panel.admin.field.distinct_from_help'))
                ->options($options)
                ->required(),
        ];
    }

    /** Todo lo capturado, para revisarlo (solo lectura, escapado). */
    public static function details(FieldSubmission $record): View
    {
        $payload = $record->payload;
        $categories = Category::query()->whereIn('id', $payload['category_ids'])->orderBy('position')->get()
            ->map(fn (Category $category): string => (string) $category->name_es)->implode(', ');
        $lat = $record->location->latitude;
        $lng = $record->location->longitude;
        $payments = array_map(fn (string $method): string => (string) __("panel.payment.{$method}"), $payload['payment_methods']);
        $locationLabel = (string) __('panel.admin.field.location');

        return view('admin.field-submission', [
            'rows' => [
                (string) __('panel.admin.field.address') => $payload['address'].($payload['reference'] !== null ? ' · '.$payload['reference'] : ''),
                (string) __('panel.admin.field.categories') => $categories,
                (string) __('panel.admin.field.phone') => $payload['phone'] ?? '—',
                (string) __('panel.admin.field.whatsapp') => $payload['whatsapp'] ?? '—',
                (string) __('panel.admin.field.delivery') => $payload['delivery'] ? __('panel.admin.field.yes') : __('panel.admin.field.no'),
                (string) __('panel.admin.field.payments') => $payments === [] ? '—' : implode(', ', $payments),
                (string) __('panel.admin.field.hours') => ConfirmationMessage::hoursLines($payload['hours'], app()->getLocale()) ?: ['—'],
                $locationLabel => sprintf('%.6F, %.6F (%s)', $lat, $lng, __("panel.admin.field.location_source_{$record->location_source}")),
                (string) __('panel.admin.field.owner') => $record->owner_name.' ('.__("panel.admin.field.owner_role_{$record->owner_role->value}").') · '.$record->owner_phone,
                (string) __('panel.admin.field.confirmation') => $record->owner_confirmed_at === null
                    ? __('panel.admin.field.not_confirmed')
                    : __('panel.admin.field.confirmation_detail', [
                        'date' => $record->owner_confirmed_at->format('Y-m-d H:i'),
                        'privacy' => (string) $record->owner_privacy_notice_version,
                        'authorization' => (string) $record->owner_authorization_version,
                        'phone' => (string) $record->confirmation_phone,
                    ]),
                (string) __('panel.admin.field.captured_at') => $record->captured_at->format('Y-m-d H:i'),
            ],
            'link' => [
                'label' => $locationLabel,
                'href' => "https://www.openstreetmap.org/?mlat={$lat}&mlon={$lng}#map=19/{$lat}/{$lng}",
            ],
        ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListFieldSubmissions::route('/'),
        ];
    }
}
