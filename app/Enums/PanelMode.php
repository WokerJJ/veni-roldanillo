<?php

namespace App\Enums;

/**
 * Cómo ve el dueño su panel (#114, ADR 0035): simple (Hoy, Mi carta y
 * Promociones) o completo («Ver todo»). Se guarda en la cuenta
 * (users.panel_mode) y solo cambia la navegación: lo que se oculta sigue
 * en su dirección, con la misma autorización. El modo de quien está en
 * sesión lo lee App\Filament\Owner\Support\PanelNavigation.
 */
enum PanelMode: string
{
    case Simple = 'simple';
    case Full = 'full';
}
