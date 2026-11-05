<?php

namespace App\Filament\Owner\Pages;

use App\Filament\Owner\Concerns\ResolvesOwnerTenant;
use App\Filament\Owner\Concerns\SetsSoldOutToday;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use App\Filament\Owner\Support\DelayNoticeActions;
use App\Filament\Owner\Support\Fields;
use App\Filament\Owner\Support\PanelModeSwitch;
use App\Filament\Owner\Support\TouchTarget;
use App\Models\DailyMenu;
use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\Restaurant;
use App\Support\BusinessDay;
use Carbon\CarbonInterface;
use Closure;
use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Panel;
use Filament\Support\Exceptions\Halt;
use Filament\Support\Icons\Heroicon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Locked;

/**
 * Hoy (#114, ADR 0035): la pantalla de inicio del panel, pensada para el
 * celular. Lo que cambia en el día: los platos y los ingredientes agotados
 * hoy (con «Ya hay» de un toque), el aviso de demora y el almuerzo del día.
 *
 * Reemplaza al tablero vacío de Filament en /panel/{slug}, en los dos modos.
 * Todo es del restaurante de la dirección (el tenant, que Filament ya
 * comprobó) y cada lectura y escritura lo autoriza con RestaurantPolicy::update
 * o RestaurantContentPolicy.
 *
 * Lo que dibuja la vista llega por getViewData(): las lecturas son métodos
 * protegidos, que el navegador no puede llamar como acciones de Livewire
 * (BUG-020). Los únicos públicos con argumentos son los de SetsSoldOutToday.
 */
class Today extends Page
{
    use ResolvesOwnerTenant, SetsSoldOutToday, TranslatesConstraintViolations;

    /** Topes del almuerzo, como los CHECK de daily_menus. */
    public const int LUNCH_DESCRIPTION_MAX = 300;

    public const int LUNCH_PRICE_MAX = 1_000_000;

    /**
     * updated_at del almuerzo de hoy cuando se abrió el modal (null: no
     * había). Si al guardar cambió, otra pestaña lo tocó y no se pisa
     * (AUD-022). Bloqueada: el navegador no la puede cambiar.
     */
    #[Locked]
    public ?string $lunchVersion = null;

    /** El almuerzo de hoy, leído una vez por petición (AUD-025). */
    private ?DailyMenu $lunch = null;

    private bool $lunchLoaded = false;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedSun;

    protected static ?int $navigationSort = -3;

    protected static ?string $slug = 'today';

    protected string $view = 'filament.owner.pages.today';

    /** En la raíz del restaurante, donde estaba el tablero. */
    public static function getRoutePath(Panel $panel): string
    {
        return '/';
    }

    public static function getNavigationLabel(): string
    {
        return __('panel.today.label');
    }

    public function getTitle(): string
    {
        return __('panel.today.heading');
    }

    /**
     * @return array<Action>
     */
    protected function getHeaderActions(): array
    {
        return PanelModeSwitch::actions();
    }

    /**
     * @return array<string, mixed>
     */
    protected function getViewData(): array
    {
        return [
            'delay' => $this->delayMinutes(),
            'dishes' => $this->soldOutDishes(),
            'ingredients' => $this->missingIngredients(),
            'lunch' => $this->lunch(),
        ];
    }

    /** @return Collection<int, Dish> */
    protected function soldOutDishes(): Collection
    {
        return $this->restaurant()->dishes()
            ->soldOutToday()
            ->orderBy('position')->orderBy('id')
            ->get(['id', 'restaurant_id', 'name_es', 'sold_out_until']);
    }

    /** @return Collection<int, Ingredient> */
    protected function missingIngredients(): Collection
    {
        return $this->restaurant()->ingredients()
            ->with('substitute:id,name_es')
            ->soldOutToday()
            ->orderBy('name_es')->orderBy('id')
            ->get();
    }

    protected function lunch(): ?DailyMenu
    {
        if (! $this->lunchLoaded) {
            $this->lunch = $this->restaurant()->dailyMenus()
                ->where('served_on', BusinessDay::today()->toDateString())
                ->first();
            $this->lunchLoaded = true;
        }

        return $this->lunch;
    }

    /** Después de publicar o quitar: la próxima lectura va a la base. */
    private function forgetLunch(): void
    {
        $this->lunch = null;
        $this->lunchLoaded = false;
    }

    protected function delayMinutes(): ?int
    {
        return $this->restaurant()->activeDelayMinutes();
    }

    public function announceDelayAction(): Action
    {
        return TouchTarget::big(DelayNoticeActions::announce($this->restaurant(...), $this->writeRestaurant(...)));
    }

    public function clearDelayAction(): Action
    {
        return TouchTarget::big(DelayNoticeActions::clear($this->restaurant(...), $this->writeRestaurant(...)));
    }

    /**
     * «Falta un ingrediente»: elegir uno de la lista del restaurante que hoy
     * sí hay. Solo se ofrecen y se aceptan los de este restaurante.
     */
    public function markIngredientMissingAction(): Action
    {
        return TouchTarget::big(Action::make('markIngredientMissing'))
            ->label(__('panel.today.mark_missing'))
            ->icon(Heroicon::OutlinedNoSymbol)
            ->color('warning')
            ->visible(fn (): bool => $this->restaurant()->ingredients()->exists())
            ->schema([
                Select::make('ingredient')
                    ->label(__('panel.today.which_ingredient'))
                    ->options(fn (): array => $this->restaurant()->ingredients()
                        ->availableToday()
                        ->orderBy('name_es')->orderBy('id')
                        ->pluck('name_es', 'id')
                        ->all())
                    ->rule(Rule::exists('ingredients', 'id')->where('restaurant_id', $this->restaurant()->id))
                    ->required(),
            ])
            ->action(function (array $data): void {
                $id = $data['ingredient'] ?? null;
                abort_unless(is_numeric($id), 422);
                $this->setIngredientSoldOut((int) $id, true);
            });
    }

    /**
     * Publicar o cambiar el almuerzo de hoy: uno por restaurante y día. El
     * modal recuerda la versión que abrió (lunchVersion) y, al guardar, la
     * compara con la de la base leída bloqueada: si otra pestaña lo cambió
     * o lo creó mientras tanto, avisa y no guarda nada.
     */
    public function publishLunchAction(): Action
    {
        return TouchTarget::big(Action::make('publishLunch'))
            ->label(fn (): string => (string) __($this->lunch() === null ? 'panel.lunch.publish' : 'panel.lunch.change'))
            ->icon(Heroicon::OutlinedPencilSquare)
            ->modalHeading(__('panel.lunch.heading'))
            ->modalDescription(__('panel.lunch.help'))
            ->fillForm(function (): array {
                $lunch = $this->lunch();
                $this->lunchVersion = self::lunchVersionOf($lunch);

                return Arr::only($lunch?->toArray() ?? [], ['description_es', 'description_en', 'price']);
            })
            ->schema([
                Fields::longText('description_es', __('panel.lunch.description_es'), self::LUNCH_DESCRIPTION_MAX, required: true)
                    ->placeholder(__('panel.lunch.placeholder')),
                Fields::longText('description_en', __('panel.lunch.description_en'), self::LUNCH_DESCRIPTION_MAX),
                Fields::pesos('price', __('panel.lunch.price'), self::LUNCH_PRICE_MAX)->minValue(1),
            ])
            ->action(function (array $data): void {
                $restaurant = $this->restaurant();
                /** @var array<string, mixed> $values */
                $values = Arr::only($data, ['description_es', 'description_en', 'price']);

                $this->writeRespectingConstraints(function () use ($restaurant, $values): DailyMenu {
                    $lunch = $restaurant->dailyMenus()
                        ->where('served_on', BusinessDay::today()->toDateString())
                        ->lockForUpdate()
                        ->first();

                    if (self::lunchVersionOf($lunch) !== $this->lunchVersion) {
                        Notification::make()
                            ->danger()
                            ->title(__('panel.errors.conflict'))
                            ->body(__('panel.errors.conflict_body'))
                            ->persistent()
                            ->send();

                        throw new Halt;
                    }

                    if ($lunch === null) {
                        Gate::authorize('create', [DailyMenu::class, $restaurant]);
                    } else {
                        Gate::authorize('update', $lunch);
                    }

                    return $restaurant->dailyMenus()->updateOrCreate(
                        ['served_on' => BusinessDay::today()->toDateString()],
                        $values,
                    );
                });
                $restaurant->touchOwnerUpdate();
                $this->forgetLunch();

                Notification::make()->success()->title(__('panel.lunch.published'))->send();
            });
    }

    public function clearLunchAction(): Action
    {
        return TouchTarget::big(Action::make('clearLunch'))
            ->label(__('panel.lunch.clear'))
            ->color('gray')
            ->requiresConfirmation()
            ->modalHeading(__('panel.lunch.clear_heading'))
            ->modalDescription(__('panel.lunch.clear_help'))
            ->visible(fn (): bool => $this->lunch() !== null)
            ->action(function (): void {
                $lunch = $this->lunch();

                if ($lunch === null) {
                    return;
                }

                Gate::authorize('delete', $lunch);
                $lunch->delete();
                $this->restaurant()->touchOwnerUpdate();
                $this->forgetLunch();

                Notification::make()->success()->title(__('panel.lunch.cleared'))->send();
            });
    }

    /**
     * Hoy no tiene formulario de la ficha: la demora se escribe en una transacción.
     *
     * @param  Closure(): Restaurant  $write
     */
    private function writeRestaurant(Closure $write): void
    {
        DB::transaction(fn (): Restaurant => $write());
    }

    /** La versión del almuerzo (su updated_at en UTC, con microsegundos), o null si no hay. */
    private static function lunchVersionOf(?DailyMenu $lunch): ?string
    {
        $updatedAt = $lunch?->updated_at;

        return $updatedAt instanceof CarbonInterface
            ? $updatedAt->toImmutable()->utc()->format('Y-m-d\TH:i:s.u\Z')
            : ($lunch === null ? null : 'sin-fecha');
    }

    /** Las restricciones del almuerzo no son de un campo del modal: aviso general. */
    protected function constraintErrorField(?string $constraint): ?string
    {
        return null;
    }
}
