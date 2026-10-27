<?php

namespace App\Filament\Owner\Pages;

use App\Enums\PaymentMethod;
use App\Filament\Concerns\DetectsConcurrentEdits;
use App\Filament\Owner\Concerns\TouchesOwnerUpdate;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use App\Filament\Owner\Support\Fields;
use App\Models\Restaurant;
use Filament\Actions\Action;
use Filament\Forms\Components\CheckboxList;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Toggle;
use Filament\Notifications\Notification;
use Filament\Pages\Tenancy\EditTenantProfile;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Gate;

/**
 * La ficha del restaurante en el panel del dueño (#18, ADR 0025): lo que el
 * dueño puede cambiar de su ficha pública. No aparecen ni se aceptan slug,
 * status, plan, verified_at, is_fictitious ni updated_by_owner_at: no están
 * en el formulario y tampoco en $fillable de Restaurant.
 *
 * Arriba, el aviso de demora: «Demora de 40 min» con un toque, que se va
 * solo a las Restaurant::DELAY_NOTICE_HOURS horas.
 *
 * Filament autoriza la página con RestaurantPolicy::update (canView).
 */
class EditRestaurantProfile extends EditTenantProfile
{
    use DetectsConcurrentEdits, TouchesOwnerUpdate, TranslatesConstraintViolations;

    /** Topes de los textos largos de la ficha. */
    public const DESCRIPTION_MAX = 1000;

    public const DELIVERY_NOTES_MAX = 500;

    /** Lo que el dueño edita de su ficha. */
    public const FIELDS = [
        'name', 'description_es', 'description_en', 'price_level', 'payment_methods',
        'address', 'reference', 'phone', 'whatsapp',
        'delivery', 'delivery_notes_es', 'delivery_notes_en',
    ];

    protected static ?string $slug = 'profile';

    public static function getLabel(): string
    {
        return __('panel.profile.label');
    }

    public function form(Schema $schema): Schema
    {
        return $schema->components([
            Section::make(__('panel.profile.section_main'))
                ->columns(2)
                ->schema([
                    Fields::text('name', __('panel.profile.name'), 120, required: true)->columnSpanFull(),
                    Fields::longText('description_es', __('panel.profile.description_es'), self::DESCRIPTION_MAX),
                    Fields::longText('description_en', __('panel.profile.description_en'), self::DESCRIPTION_MAX),
                    Select::make('price_level')
                        ->label(__('panel.profile.price_level'))
                        ->options([1 => '$', 2 => '$$', 3 => '$$$', 4 => '$$$$'])
                        ->in([1, 2, 3, 4]),
                    CheckboxList::make('payment_methods')
                        ->label(__('panel.profile.payment_methods'))
                        ->options(collect(PaymentMethod::cases())
                            ->mapWithKeys(fn (PaymentMethod $method): array => [$method->value => __("panel.payment.{$method->value}")])
                            ->all())
                        ->columns(2),
                ]),
            Section::make(__('panel.profile.section_contact'))
                ->columns(2)
                ->schema([
                    Fields::text('address', __('panel.profile.address'), 160),
                    Fields::text('reference', __('panel.profile.reference'), 160),
                    Fields::text('phone', __('panel.profile.phone'), 20)->tel(),
                    Fields::text('whatsapp', __('panel.profile.whatsapp'), 20)
                        ->tel()
                        ->helperText(__('panel.profile.whatsapp_help'))
                        ->regex('/^\+?[\d\s()-]{10,19}$/'),
                ]),
            Section::make(__('panel.profile.section_delivery'))
                ->columns(2)
                ->schema([
                    Toggle::make('delivery')->label(__('panel.profile.delivery'))->columnSpanFull(),
                    Fields::longText('delivery_notes_es', __('panel.profile.delivery_notes_es'), self::DELIVERY_NOTES_MAX),
                    Fields::longText('delivery_notes_en', __('panel.profile.delivery_notes_en'), self::DELIVERY_NOTES_MAX),
                ]),
        ]);
    }

    /**
     * @return array<Action>
     */
    protected function getHeaderActions(): array
    {
        return [
            Action::make('announceDelay')
                ->label(__('panel.delay.announce'))
                ->icon('heroicon-o-clock')
                ->schema([
                    Select::make('minutes')
                        ->label(__('panel.delay.minutes'))
                        ->options(collect(Restaurant::DELAY_NOTICE_OPTIONS)
                            ->mapWithKeys(fn (int $minutes): array => [$minutes => __('panel.delay.option', ['minutes' => $minutes])])
                            ->all())
                        ->in(Restaurant::DELAY_NOTICE_OPTIONS)
                        ->required(),
                ])
                ->modalDescription(__('panel.delay.help', ['hours' => Restaurant::DELAY_NOTICE_HOURS]))
                ->action(function (array $data): void {
                    $restaurant = $this->restaurant();
                    $minutes = $data['minutes'] ?? null;
                    abort_unless(is_numeric($minutes), 422);
                    $restaurant->announceDelay((int) $minutes);
                    $this->rememberVersion();
                    Notification::make()->success()->title(__('panel.delay.announced'))->send();
                }),
            Action::make('clearDelay')
                ->label(__('panel.delay.clear'))
                ->color('gray')
                ->visible(fn (): bool => $this->restaurant()->activeDelayMinutes() !== null)
                ->action(function (): void {
                    $this->restaurant()->clearDelay();
                    $this->rememberVersion();
                    Notification::make()->success()->title(__('panel.delay.cleared'))->send();
                }),
        ];
    }

    public function getSubheading(): ?string
    {
        $minutes = $this->restaurant()->activeDelayMinutes();

        $text = $minutes === null ? null : __('panel.delay.active', ['minutes' => $minutes]);

        return is_string($text) ? $text : null;
    }

    /**
     * Solo los campos del formulario: lo demás de la ficha (la ubicación, el
     * plan, el estado) no viaja al navegador.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeFill(array $data): array
    {
        /** @var array<string, mixed> $data */
        $data = Arr::only($data, self::FIELDS);
        $data['payment_methods'] = $this->restaurant()->payment_methods
            ->map(fn (PaymentMethod $method): string => $method->value)
            ->all();

        return $data;
    }

    /**
     * Y solo esos se guardan, aunque llegara otro en la petición.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeSave(array $data): array
    {
        /** @var array<string, mixed> $fields */
        $fields = Arr::only($data, self::FIELDS);

        return $fields;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleRecordUpdate(Model $record, array $data): Model
    {
        return $this->writeRespectingConstraints(function () use ($record, $data): Model {
            $this->guardAgainstConcurrentEdit();

            return parent::handleRecordUpdate($record, $data);
        });
    }

    protected function afterSave(): void
    {
        $this->touchOwnerUpdate();
        $this->rememberVersion();
    }

    /** La ficha: si administración u otra pestaña la guardó, no se pisa. */
    protected function versionedRecord(): Model
    {
        return $this->restaurant();
    }

    /**
     * El campo de cada restricción de restaurants que el formulario toca; las
     * demás (el slug, el aviso de demora) no son de un campo: aviso general.
     */
    protected function constraintErrorField(?string $constraint): ?string
    {
        return match ($constraint) {
            'restaurants_whatsapp_format' => 'data.whatsapp',
            'restaurants_price_level_range' => 'data.price_level',
            'restaurants_payment_methods_array', 'restaurants_payment_methods_known' => 'data.payment_methods',
            default => null,
        };
    }

    private function restaurant(): Restaurant
    {
        $restaurant = $this->tenant;
        abort_unless($restaurant instanceof Restaurant, 404);
        Gate::authorize('update', $restaurant);

        return $restaurant;
    }
}
