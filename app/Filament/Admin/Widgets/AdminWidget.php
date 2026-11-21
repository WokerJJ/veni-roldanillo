<?php

namespace App\Filament\Admin\Widgets;

use App\Models\User;
use Filament\Widgets\Widget;
use Illuminate\Support\Facades\Auth;

/**
 * Base de los widgets del Escritorio de administración (ADR 0050). Son de
 * solo lectura y los ve solo users.role = admin: además de que el panel solo
 * deja entrar a administración (User::canAccessPanel), cada widget lo exige
 * por su cuenta, como AdminResource con los recursos. Un widget es un
 * componente de Livewire con su propia ruta de actualización, así que no
 * basta con que la página lo oculte.
 */
abstract class AdminWidget extends Widget
{
    protected int|string|array $columnSpan = 'full';

    /** Consultas agregadas y pequeñas: se pintan con la página, sin segunda petición. */
    protected static bool $isLazy = false;

    public static function canView(): bool
    {
        $user = Auth::user();

        return $user instanceof User && $user->isAdmin();
    }
}
