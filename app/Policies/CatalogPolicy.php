<?php

namespace App\Policies;

use App\Models\CatalogGroup;
use App\Models\CatalogItem;
use App\Models\CatalogVariant;
use App\Models\User;

/**
 * El catálogo del modo Campo (ADR 0050) es de administración: nadie más lo ve
 * ni lo cambia desde el panel. (El teléfono lo recibe por `/campo/api/me`, que
 * exige la Policy de las capturas.)
 */
class CatalogPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isAdmin();
    }

    public function view(User $user, CatalogGroup|CatalogItem|CatalogVariant $record): bool
    {
        return $user->isAdmin();
    }

    public function create(User $user): bool
    {
        return $user->isAdmin();
    }

    public function update(User $user, CatalogGroup|CatalogItem|CatalogVariant $record): bool
    {
        return $user->isAdmin();
    }

    /** Se desactiva, no se borra: lo que ya está en una carta no depende del catálogo, pero el historial sí. */
    public function delete(User $user, CatalogGroup|CatalogItem|CatalogVariant $record): bool
    {
        return false;
    }
}
