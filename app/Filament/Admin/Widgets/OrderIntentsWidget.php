<?php

namespace App\Filament\Admin\Widgets;

use App\Filament\Admin\Resources\Restaurants\RestaurantResource;
use App\Support\OrderIntentRanking;
use App\Support\OrderIntentStats;
use Livewire\Attributes\Url;

/**
 * Toques en «Enviar pedido por WhatsApp» de todos los restaurantes: por día
 * contra el período anterior y el ranking. Son toques, no pedidos
 * (ADR 0031). Reutiliza OrderIntentStats, así que el día es el de Colombia.
 * El período que llega del navegador se acota a OrderIntentStats::PERIODS.
 */
class OrderIntentsWidget extends AdminWidget
{
    /** Cuántos restaurantes salen en el ranking. */
    public const RANKING = 10;

    protected static ?int $sort = 3;

    protected string $view = 'filament.admin.widgets.order-intents';

    #[Url(as: 'toques')]
    public int $days = 7;

    /** Llega del navegador: un valor que no es un entero da 404, no un 500. */
    public function setPeriod(mixed $days): void
    {
        abort_unless(is_int($days) || (is_string($days) && ctype_digit($days)), 404);

        $this->days = (int) $days;
    }

    public function period(): int
    {
        return in_array($this->days, OrderIntentStats::PERIODS, true) ? $this->days : OrderIntentStats::PERIODS[0];
    }

    public function stats(): OrderIntentStats
    {
        return OrderIntentStats::overall($this->period());
    }

    /**
     * @return list<object{id: int, name: string, current: int, previous: int}>
     */
    public function ranking(): array
    {
        return OrderIntentRanking::top($this->period(), self::RANKING);
    }

    public function restaurantUrl(int $id): ?string
    {
        return RestaurantResource::canAccess() ? RestaurantResource::getUrl('edit', ['record' => $id]) : null;
    }
}
