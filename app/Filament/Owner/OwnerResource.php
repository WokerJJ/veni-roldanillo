<?php

namespace App\Filament\Owner;

use App\Models\Restaurant;
use Filament\Facades\Filament;
use Filament\Resources\Resource;
use Illuminate\Support\Facades\Gate;

/**
 * Base de los recursos del panel del dueño (ADR 0025).
 *
 * Filament filtra cada tabla por el restaurante de la dirección (tenancy) y
 * cuelga de él lo que se crea. La autorización sigue en las Policies: ver la
 * lista y crear se preguntan con el restaurante de la dirección
 * (RestaurantPolicy::update y RestaurantContentPolicy::create, que recibe el
 * restaurante, nunca un restaurant_id del cliente); editar y borrar, con el
 * registro (RestaurantContentPolicy, que sigue las FK guardadas). Sin acciones
 * en bloque: cada cambio pasa por su registro.
 */
abstract class OwnerResource extends Resource
{
    public static function currentRestaurant(): ?Restaurant
    {
        $tenant = Filament::getTenant();

        return $tenant instanceof Restaurant ? $tenant : null;
    }

    public static function canViewAny(): bool
    {
        $restaurant = static::currentRestaurant();

        return $restaurant !== null && Gate::allows('update', $restaurant);
    }

    public static function canCreate(): bool
    {
        $restaurant = static::currentRestaurant();

        return $restaurant !== null && Gate::allows('create', [static::getModel(), $restaurant]);
    }

    public static function canDeleteAny(): bool
    {
        return false;
    }

    /**
     * Los datos del formulario antes de crear o guardar (CreateOwnerRecord y
     * EditOwnerRecord).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function mutateFormData(array $data): array
    {
        return $data;
    }

    /** El campo donde se avisa si la base rechaza el registro. */
    public static function constraintErrorField(): string
    {
        return 'data.name_es';
    }
}
