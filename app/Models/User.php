<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\Locale;
use App\Enums\RestaurantRole;
use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Filament\Models\Contracts\FilamentUser;
use Filament\Models\Contracts\HasTenants;
use Filament\Panel;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;

/**
 * role queda fuera de $fillable: nadie se vuelve administrador por un formulario.
 *
 * Larastan tipa las columnas enum de la migración como literales e ignora el
 * cast; los @property fijan el tipo del enum PHP.
 *
 * locale nulo: la persona no ha elegido idioma y decide el dispositivo (ADR 0010).
 *
 * must_change_password tampoco es asignable: lo enciende la aprobación de un
 * reclamo (contraseña temporal) y lo apaga cambiarla en el perfil (#19).
 *
 * @property UserRole $role
 * @property Locale|null $locale
 * @property bool $must_change_password
 */
#[Fillable(['name', 'email', 'password', 'locale'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements FilamentUser, HasTenants
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /** @var array<string, mixed> */
    protected $attributes = [
        'role' => 'user',
    ];

    /**
     * Rol en cada restaurante ya consultado (hasRestaurantRole), por id;
     * null si no es miembro.
     *
     * @var array<int, string|null>
     */
    private array $restaurantRoles = [];

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
            'must_change_password' => 'boolean',
        ];
    }

    /**
     * El correo se guarda en minúsculas y sin espacios a los lados: es la
     * llave de la cuenta, y la base no deja dos que solo difieran en
     * mayúsculas (índice único de lower(email), #19).
     *
     * @return Attribute<string, string>
     */
    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value): string => mb_strtolower(trim($value)));
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

    /**
     * Restaurantes de los que es dueño (no empleado).
     *
     * @return BelongsToMany<Restaurant, $this, RestaurantUser, 'membership'>
     */
    public function ownedRestaurants(): BelongsToMany
    {
        return $this->restaurants()->wherePivot('role', RestaurantRole::Owner->value);
    }

    /**
     * Panel del dueño (ADR 0025): entra quien es dueño de algún restaurante.
     * Los empleados todavía no tienen panel (editar es del dueño,
     * RestaurantPolicy::update). Panel de administración (ADR 0027): solo
     * users.role = admin. Cualquier otro panel, nadie.
     */
    public function canAccessPanel(Panel $panel): bool
    {
        return match ($panel->getId()) {
            'owner' => $this->ownedRestaurants()->exists(),
            'admin' => $this->isAdmin(),
            default => false,
        };
    }

    /**
     * Los restaurantes que aparecen en el selector del panel.
     *
     * @return Collection<int, Restaurant>
     */
    public function getTenants(Panel $panel): Collection
    {
        return $this->ownedRestaurants()->orderBy('name')->get();
    }

    /**
     * Filament lo pregunta en cada petición con el restaurante del slug de la
     * dirección: se consulta la base, como en la Policy.
     */
    public function canAccessTenant(Model $tenant): bool
    {
        return $tenant instanceof Restaurant && $this->ownsRestaurant($tenant);
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
     * Consulta la base de datos (no confía en relaciones ya cargadas), una
     * vez por restaurante y por instancia: la persona autenticada se arma de
     * nuevo en cada petición (también bajo Octane), así que es una consulta
     * por restaurante y petición, no una por fila de una tabla del panel.
     */
    private function hasRestaurantRole(Restaurant $restaurant, ?RestaurantRole $role): bool
    {
        $key = $restaurant->id;

        if (! array_key_exists($key, $this->restaurantRoles)) {
            $stored = $this->restaurants()->whereKey($key)->value('restaurant_user.role');
            $this->restaurantRoles[$key] = is_string($stored) ? $stored : null;
        }

        $stored = $this->restaurantRoles[$key];

        return $stored !== null && ($role === null || $stored === $role->value);
    }
}
