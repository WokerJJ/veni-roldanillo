<?php

namespace App\Filament\Owner\Support;

use Filament\Actions\Action;
use Filament\Support\Enums\Size;

/** Botones del panel simple pensados para el dedo (#114, ADR 0035). */
final class TouchTarget
{
    /** Botón grande: objetivo táctil de 44 px como mínimo (WCAG 2.5.5). */
    public static function big(Action $action): Action
    {
        return $action
            ->size(Size::Large)
            ->extraAttributes(['style' => 'min-height: 2.75rem']);
    }
}
