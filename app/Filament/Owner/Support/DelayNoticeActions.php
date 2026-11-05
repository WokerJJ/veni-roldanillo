<?php

namespace App\Filament\Owner\Support;

use App\Models\Restaurant;
use Closure;
use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Notifications\Notification;

/**
 * «Avisar demora» y «Quitar aviso» (#18, ADR 0025): la ficha muestra
 * «Demora de N min» y el aviso se va solo a las Restaurant::DELAY_NOTICE_HOURS
 * horas. Los usan la ficha del restaurante (EditRestaurantProfile) y Hoy
 * (#114, ADR 0035), cada una con su forma de escribir:
 *
 * - $restaurant devuelve el restaurante de la dirección ya autorizado.
 * - $write recibe la escritura y la corre: la ficha, al lado de su formulario
 *   sin tragarse un cambio ajeno (DetectsConcurrentEdits::writeBesideForm);
 *   Hoy, que no tiene formulario de la ficha, en una transacción.
 */
final class DelayNoticeActions
{
    /**
     * @param  Closure(): Restaurant  $restaurant
     * @param  Closure(Closure(): Restaurant): void  $write
     */
    public static function announce(Closure $restaurant, Closure $write): Action
    {
        return Action::make('announceDelay')
            ->label(__('panel.delay.announce'))
            ->icon('heroicon-o-clock')
            ->schema([
                Select::make('minutes')
                    ->label(__('panel.delay.minutes'))
                    ->options(collect(Restaurant::DELAY_NOTICE_OPTIONS)
                        ->mapWithKeys(fn (int $minutes): array => [$minutes => __('panel.delay.option', ['minutes' => $minutes])])
                        ->all())
                    ->in(Restaurant::DELAY_NOTICE_OPTIONS)
                    ->required(),
            ])
            ->modalDescription(__('panel.delay.help', ['hours' => Restaurant::DELAY_NOTICE_HOURS]))
            ->action(function (array $data) use ($restaurant, $write): void {
                $record = $restaurant();
                $minutes = $data['minutes'] ?? null;
                abort_unless(is_numeric($minutes), 422);
                $write(function () use ($record, $minutes): Restaurant {
                    $record->announceDelay((int) $minutes);

                    return $record;
                });
                Notification::make()->success()->title(__('panel.delay.announced'))->send();
            });
    }

    /**
     * @param  Closure(): Restaurant  $restaurant
     * @param  Closure(Closure(): Restaurant): void  $write
     */
    public static function clear(Closure $restaurant, Closure $write): Action
    {
        return Action::make('clearDelay')
            ->label(__('panel.delay.clear'))
            ->color('gray')
            ->visible(fn (): bool => $restaurant()->activeDelayMinutes() !== null)
            ->action(function () use ($restaurant, $write): void {
                $write(function () use ($restaurant): Restaurant {
                    $record = $restaurant();
                    $record->clearDelay();

                    return $record;
                });
                Notification::make()->success()->title(__('panel.delay.cleared'))->send();
            });
    }
}
