<?php

namespace App\Filament\Owner\Support;

use App\Enums\PanelMode;
use App\Models\User;
use Filament\Actions\Action;
use Filament\Facades\Filament;
use Filament\Support\Icons\Heroicon;

/**
 * «Ver todo» / «Volver al modo simple» (#114, ADR 0035): cambia el modo del
 * panel de la cuenta que está en sesión y recarga en Hoy, que existe en los
 * dos modos.
 *
 * Son dos acciones, cada una con el modo al que lleva, no «cambiá al otro»
 * (BUG-021): «Ver todo» en una pestaña vieja, cuando otra ya pasó al modo
 * completo, deja el completo en vez de volver al simple. Cada una se ve solo
 * en el modo contrario.
 *
 * Son acciones de Livewire, no enlaces: cambian un dato, así que viajan por
 * POST con el token de Livewire (CSRF), nunca por un GET que un enlace o una
 * imagen de otro sitio pudiera disparar. Solo cambian la cuenta propia: no
 * reciben ningún id ni valor del navegador.
 *
 * Las dos van en el menú de la cuenta (OwnerPanelProvider) y arriba en Hoy,
 * donde el dueño las encuentra sin abrir el menú.
 */
final class PanelModeSwitch
{
    public const string TO_FULL = 'showFullPanel';

    public const string TO_SIMPLE = 'showSimplePanel';

    /** @return list<Action> */
    public static function actions(): array
    {
        return [self::toFull(), self::toSimple()];
    }

    public static function toFull(): Action
    {
        return self::make(self::TO_FULL, PanelMode::Full, 'panel.mode.to_full', Heroicon::OutlinedSquares2x2);
    }

    public static function toSimple(): Action
    {
        return self::make(self::TO_SIMPLE, PanelMode::Simple, 'panel.mode.to_simple', Heroicon::OutlinedSparkles);
    }

    private static function make(string $name, PanelMode $target, string $label, Heroicon $icon): Action
    {
        return Action::make($name)
            ->label(fn (): string => self::text($label))
            ->icon($icon)
            ->color('gray')
            ->visible(fn (): bool => PanelNavigation::current() !== $target)
            ->action(function (Action $action) use ($target): void {
                $user = Filament::auth()->user();
                abort_unless($user instanceof User, 403);

                $user->switchPanelMode($target);

                $action->redirect(Filament::getUrl(Filament::getTenant()) ?? url('/panel'));
            });
    }

    private static function text(string $key): string
    {
        $text = __($key);

        return is_string($text) ? $text : '';
    }
}
