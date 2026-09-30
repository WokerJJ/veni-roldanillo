<?php

namespace App\Models;

use App\Casts\AsGeoPoint;
use App\Enums\RestaurantPlan;
use App\Enums\RestaurantRole;
use App\Enums\RestaurantStatus;
use Database\Factories\RestaurantFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Ficha de un restaurante. status, plan, verified_at e is_fictitious quedan
 * fuera de $fillable: los cambia el sistema o un administrador, nunca un
 * formulario del dueño.
 *
 * Larastan tipa las columnas enum de la migración como literales e ignora el
 * cast; los @property fijan el tipo del enum PHP.
 *
 * @property RestaurantStatus $status
 * @property RestaurantPlan $plan
 */
#[Fillable([
    'name', 'slug', 'category_id', 'description_es', 'description_en',
    'address', 'reference', 'location', 'phone', 'whatsapp', 'price_level',
    'delivery', 'delivery_notes_es', 'delivery_notes_en', 'payment_methods',
])]
class Restaurant extends Model
{
    /** @use HasFactory<RestaurantFactory> */
    use HasFactory;

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
            'payment_methods' => 'array',
            'status' => RestaurantStatus::class,
            'plan' => RestaurantPlan::class,
            'verified_at' => 'datetime',
            'updated_by_owner_at' => 'datetime',
            'is_fictitious' => 'boolean',
        ];
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

    /** @return BelongsTo<Category, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
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

    /** @return HasMany<MenuSection, $this> */
    public function menuSections(): HasMany
    {
        return $this->hasMany(MenuSection::class)->orderBy('position');
    }

    /** @return HasMany<Dish, $this> */
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
