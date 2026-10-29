<?php

namespace App\Models;

use App\Casts\AsGeoPoint;
use App\Enums\PaymentMethod;
use App\Enums\RestaurantPlan;
use App\Enums\RestaurantRole;
use App\Enums\RestaurantStatus;
use App\Jobs\SyncRestaurantDishes;
use App\Models\Concerns\HasTranslatableFields;
use App\Observers\SearchIndexObserver;
use App\Support\BusinessDay;
use App\Support\GeoPoint;
use Carbon\CarbonInterface;
use Database\Factories\RestaurantFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\AsEnumCollection;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Collection;

/**
 * Ficha de un restaurante. slug, status, plan, verified_at e is_fictitious
 * quedan fuera de $fillable: los cambia el sistema o un administrador, nunca
 * un formulario del dueño (el slug es la URL pública de la ficha).
 *
 * Domicilios: delivery_zones manda. Si el restaurante tiene zonas, lleva a
 * esos barrios con ese costo; delivery solo dice que hace domicilios mientras
 * no haya zonas cargadas (costo por consultar).
 *
 * Larastan tipa las columnas enum de la migración como literales e ignora el
 * cast; los @property fijan el tipo del enum PHP. Tampoco conoce el cast
 * propio de la ubicación ni el de la lista de medios de pago.
 *
 * @property RestaurantStatus $status
 * @property RestaurantPlan $plan
 * @property GeoPoint $location
 * @property Collection<int, PaymentMethod> $payment_methods
 * @property CarbonInterface|null $updated_by_owner_at
 * @property int|null $delay_minutes
 * @property CarbonInterface|null $delay_until
 */
#[Fillable([
    'name', 'description_es', 'description_en',
    'address', 'reference', 'location', 'phone', 'whatsapp', 'price_level',
    'delivery', 'delivery_notes_es', 'delivery_notes_en', 'payment_methods',
])]
class Restaurant extends Model
{
    /** @use HasFactory<RestaurantFactory> */
    use HasFactory, HasTranslatableFields;

    /** Cuánto dura un aviso de demora si el dueño no lo quita antes. */
    public const DELAY_NOTICE_HOURS = 3;

    /** Los minutos que se pueden anunciar (el CHECK de la base va de 5 a 180). */
    public const DELAY_NOTICE_OPTIONS = [15, 20, 30, 40, 60, 90];

    /** @var array<string, mixed> */
    protected $attributes = [
        'status' => 'unclaimed',
        'plan' => 'free',
        'delivery' => false,
        'payment_methods' => '[]',
        'is_fictitious' => false,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'location' => AsGeoPoint::class,
            'price_level' => 'integer',
            'delivery' => 'boolean',
            'payment_methods' => AsEnumCollection::of(PaymentMethod::class),
            'status' => RestaurantStatus::class,
            'plan' => RestaurantPlan::class,
            'verified_at' => 'datetime',
            'updated_by_owner_at' => 'datetime',
            'delay_minutes' => 'integer',
            'delay_until' => 'datetime',
            'is_fictitious' => 'boolean',
        ];
    }

    /**
     * Campos con columnas _es y _en (ver HasTranslatableFields).
     *
     * @return list<string>
     */
    public function translatableFields(): array
    {
        return ['description', 'delivery_notes'];
    }

    /**
     * Fichas visibles en el sitio público: las sin reclamar y las reclamadas.
     * La lista vive en RestaurantStatus::published(), la misma que usa la
     * Policy para decidir quién ve una ficha.
     *
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function published(Builder $query): void
    {
        $query->whereIn('status', RestaurantStatus::published());
    }

    /**
     * Carga las categorías como se publican: slug y nombre, en el orden del
     * catálogo. El mapa y la ficha las piden igual.
     *
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function withPublicCategories(Builder $query): void
    {
        $query->with([
            'categories' => function (Relation $categories): void {
                $categories
                    ->select(['categories.id', 'categories.slug', 'categories.name_es', 'categories.name_en'])
                    ->orderBy('categories.position')
                    ->orderBy('categories.id');
            },
        ]);
    }

    /**
     * Carga el horario con que el dispositivo calcula «abierto ahora»
     * (ADR 0017): el semanal y los horarios especiales de la ventana de
     * BusinessDay, en orden. El mapa y la ficha piden el mismo, y por eso el
     * estado que se lee en los dos es el mismo. La nota de un horario
     * especial solo la publica la ficha.
     *
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function withPublicSchedule(Builder $query): void
    {
        [$from, $until] = BusinessDay::specialHoursWindow();

        $query->with([
            'openingHours' => function (Relation $hours): void {
                $hours
                    ->select(['id', 'restaurant_id', 'weekday', 'opens_at', 'closes_at'])
                    ->orderBy('weekday')
                    ->orderBy('opens_at');
            },
            'specialHours' => function (Relation $days) use ($from, $until): void {
                $days
                    ->select(['id', 'restaurant_id', 'on_date', 'closed', 'opens_at', 'closes_at', 'note_es', 'note_en'])
                    ->whereBetween('on_date', [$from, $until])
                    ->orderBy('on_date')
                    ->orderBy('opens_at');
            },
        ]);
    }

    /**
     * Carga el almuerzo del día de hoy en Colombia («Almuerzos de hoy», #12):
     * a lo sumo uno por restaurante (único por restaurante y fecha). Viaja en
     * la capa del mapa (ADR 0028): la descripción en los dos idiomas porque
     * la respuesta elige uno, y el precio.
     *
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function withTodaysLunch(Builder $query): void
    {
        $today = BusinessDay::today()->toDateString();

        $query->with([
            'dailyMenus' => function (Relation $menus) use ($today): void {
                $menus
                    ->select(['id', 'restaurant_id', 'served_on', 'description_es', 'description_en', 'price'])
                    ->where('served_on', $today);
            },
        ]);
    }

    /**
     * WhatsApp para wa.me: quita espacios, «+», guiones, puntos y paréntesis,
     * y antepone 57 a un celular de diez dígitos (empieza por 3). Lo que no
     * quede como 57 + diez dígitos lo rechaza el CHECK de la base.
     *
     * @return Attribute<never, string|null>
     */
    protected function whatsapp(): Attribute
    {
        return Attribute::make(set: function (?string $value): ?string {
            if ($value === null) {
                return null;
            }

            $digits = (string) preg_replace('/[\s+\-.()]/', '', $value);

            if ($digits === '') {
                return null;
            }

            if (strlen($digits) === 10 && str_starts_with($digits, '3')) {
                return '57'.$digits;
            }

            return $digits;
        });
    }

    /** @return BelongsToMany<Category, $this> */
    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class);
    }

    /**
     * Cambia las categorías de una ficha guardada. Es la única puerta (panel
     * de administración e importación de OSM): las categorías van en cada
     * plato del índice de búsqueda (ADR 0029) y no disparan eventos del
     * modelo, así que aquí se reindexan sus platos si la ficha está publicada.
     * Si el mismo guardado ya cambió el estado, el nombre o el slug,
     * SearchIndexObserver ya lo encoló y no se repite.
     *
     * @param  list<int|string>  $ids
     */
    public function syncCategories(array $ids): void
    {
        $changes = $this->categories()->sync($ids);

        if (array_filter($changes) !== []
            && $this->status->isPublished()
            && ! $this->wasChanged(SearchIndexObserver::RESTAURANT_FIELDS)) {
            SyncRestaurantDishes::dispatch($this->id);
        }
    }

    /**
     * Dueños y empleados.
     *
     * @return BelongsToMany<User, $this, RestaurantUser, 'membership'>
     */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class)
            ->using(RestaurantUser::class)
            ->as('membership')
            ->withPivot('role')
            ->withTimestamps();
    }

    /** @return BelongsToMany<User, $this, RestaurantUser, 'membership'> */
    public function owners(): BelongsToMany
    {
        return $this->members()->wherePivot('role', RestaurantRole::Owner->value);
    }

    /** @return HasMany<OpeningHour, $this> */
    public function openingHours(): HasMany
    {
        return $this->hasMany(OpeningHour::class);
    }

    /** @return HasMany<SpecialHour, $this> */
    public function specialHours(): HasMany
    {
        return $this->hasMany(SpecialHour::class);
    }

    /**
     * Desempate por id: con la misma posición el orden sería arbitrario.
     *
     * @return HasMany<MenuSection, $this>
     */
    public function menuSections(): HasMany
    {
        return $this->hasMany(MenuSection::class)->orderBy('position')->orderBy('id');
    }

    /**
     * Único camino para crear platos (restaurant_id no es asignable):
     * $restaurant->dishes()->create([...]). Ver Dish.
     *
     * @return HasMany<Dish, $this>
     */
    public function dishes(): HasMany
    {
        return $this->hasMany(Dish::class);
    }

    /** @return HasMany<DailyMenu, $this> */
    public function dailyMenus(): HasMany
    {
        return $this->hasMany(DailyMenu::class);
    }

    /** @return HasMany<Promotion, $this> */
    public function promotions(): HasMany
    {
        return $this->hasMany(Promotion::class);
    }

    /** @return HasMany<DeliveryZone, $this> */
    public function deliveryZones(): HasMany
    {
        return $this->hasMany(DeliveryZone::class);
    }

    /**
     * Barrios con domicilio; el costo viaja en ->zone->fee.
     *
     * @return BelongsToMany<Neighborhood, $this, DeliveryZone, 'zone'>
     */
    public function neighborhoods(): BelongsToMany
    {
        return $this->belongsToMany(Neighborhood::class, 'delivery_zones')
            ->using(DeliveryZone::class)
            ->as('zone')
            ->withPivot('id', 'fee')
            ->withTimestamps();
    }

    /**
     * De dónde vino la ficha, si se importó (ADR 0021). Las propias no tienen.
     *
     * @return HasOne<RestaurantSource, $this>
     */
    public function source(): HasOne
    {
        return $this->hasOne(RestaurantSource::class);
    }

    /** @return HasMany<RestaurantClaim, $this> */
    public function claims(): HasMany
    {
        return $this->hasMany(RestaurantClaim::class);
    }

    /**
     * Se puede reclamar (#20, ADR 0026): publicada y sin dueño todavía. La
     * misma regla decide el formulario y el enlace «Reclámalo» de la ficha.
     */
    public function isClaimable(): bool
    {
        return $this->status === RestaurantStatus::Unclaimed;
    }

    /** @return HasMany<RestaurantRemovalRequest, $this> */
    public function removalRequests(): HasMany
    {
        return $this->hasMany(RestaurantRemovalRequest::class);
    }

    /** @return HasMany<OrderIntent, $this> */
    public function orderIntents(): HasMany
    {
        return $this->hasMany(OrderIntent::class);
    }

    /**
     * Minutos del aviso de demora que se publican (#18, ADR 0025), o null si
     * no hay aviso o ya venció: el aviso se va solo, sin tarea programada.
     */
    public function activeDelayMinutes(): ?int
    {
        if ($this->delay_minutes === null || $this->delay_until === null || $this->delay_until->isPast()) {
            return null;
        }

        return $this->delay_minutes;
    }

    /**
     * Anuncia «Demora de N min» por DELAY_NOTICE_HOURS horas. Lo llama el
     * panel del dueño; no es asignable en masa.
     */
    public function announceDelay(int $minutes): void
    {
        $this->forceFill([
            'delay_minutes' => $minutes,
            'delay_until' => now()->addHours(self::DELAY_NOTICE_HOURS),
        ])->save();
    }

    public function clearDelay(): void
    {
        $this->forceFill(['delay_minutes' => null, 'delay_until' => null])->save();
    }

    /**
     * «Actualizada el…» de la ficha: el dueño cambió algo desde su panel.
     * updated_by_owner_at no es asignable en masa; solo lo escribe esto.
     */
    public function touchOwnerUpdate(): void
    {
        $this->forceFill(['updated_by_owner_at' => now()])->save();
    }
}
