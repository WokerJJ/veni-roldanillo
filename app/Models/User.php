<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\Locale;
use App\Enums\RestaurantRole;
use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * role queda fuera de $fillable: nadie se vuelve administrador por un formulario.
 *
 * Larastan tipa las columnas enum de la migración como literales e ignora el
 * cast; los @property fijan el tipo del enum PHP.
 *
 * locale nulo: la persona no ha elegido idioma y decide el dispositivo (ADR 0010).
 *
 * @property UserRole $role
 * @property Locale|null $locale
 */
#[Fillable(['name', 'email', 'password', 'locale'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /** @var array<string, mixed> */
    protected $attributes = [
        'role' => 'user',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
            'locale' => Locale::class,
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === UserRole::Admin;
    }

    /**
     * Restaurantes de los que es dueño o empleado.
     *
     * @return BelongsToMany<Restaurant, $this, RestaurantUser, 'membership'>
     */
    public function restaurants(): BelongsToMany
    {
        return $this->belongsToMany(Restaurant::class)
            ->using(RestaurantUser::class)
            ->as('membership')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function ownsRestaurant(Restaurant $restaurant): bool
    {
        return $this->hasRestaurantRole($restaurant, RestaurantRole::Owner);
    }

    public function worksAt(Restaurant $restaurant): bool
    {
        return $this->hasRestaurantRole($restaurant, null);
    }

    /** @return HasMany<RestaurantClaim, $this> */
    public function restaurantClaims(): HasMany
    {
        return $this->hasMany(RestaurantClaim::class);
    }

    /** @return HasMany<OrderIntent, $this> */
    public function orderIntents(): HasMany
    {
        return $this->hasMany(OrderIntent::class);
    }

    /**
     * Consulta la base de datos (no confía en relaciones ya cargadas).
     */
    private function hasRestaurantRole(Restaurant $restaurant, ?RestaurantRole $role): bool
    {
        $query = $this->restaurants()->whereKey($restaurant->getKey());

        if ($role !== null) {
            $query->wherePivot('role', $role->value);
        }

        return $query->exists();
    }
}
