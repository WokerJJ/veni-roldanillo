<?php

namespace App\Filament\Owner\Support;

use App\Enums\PanelMode;
use App\Models\User;
use Filament\Facades\Filament;

/**
 * El modo del panel de quien está en sesión (#114, ADR 0035). PanelMode es
 * solo el valor guardado en la cuenta; leer la sesión de Filament va aquí,
 * del lado del panel.
 */
final class PanelNavigation
{
    /** El modo de la persona que está en el panel; sin sesión, el simple. */
    public static function current(): PanelMode
    {
        $user = Filament::auth()->user();

        return $user instanceof User ? $user->panel_mode : PanelMode::Simple;
    }

    public static function isFull(): bool
    {
        return self::current() === PanelMode::Full;
    }
}
