<?php

namespace App\Models;

use App\Casts\AsGeoPoint;
use App\Enums\PaymentMethod;
use App\Enums\RestaurantPlan;
use App\Enums\RestaurantRole;
use App\Enums\RestaurantStatus;
use App\Models\Concerns\HasTranslatableFields;
use App\Support\GeoPoint;
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
 * propio de la ubicación.
 *
 * @property RestaurantStatus $status
 * @property RestaurantPlan $plan
 * @property GeoPoint $location
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
     * Fichas visibles en el sitio público (todas menos las ocultas).
     *
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function published(Builder $query): void
    {
        $query->where('status', '!=', RestaurantStatus::Hidden->value);
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

    /** @return HasMany<RestaurantClaim, $this> */
    public function claims(): HasMany
    {
        return $this->hasMany(RestaurantClaim::class);
    }

    /** @return HasMany<OrderIntent, $this> */
    public function orderIntents(): HasMany
    {
        return $this->hasMany(OrderIntent::class);
    }
}
