<?php

namespace App\Support;

use App\Enums\RestaurantStatus;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Los restaurantes con más toques en «Enviar pedido por WhatsApp» en los
 * últimos $days días, contra los $days anteriores (Escritorio de
 * administración). Una sola consulta agregada con las dos ventanas en la
 * misma pasada, sobre el índice (restaurant_id, created_at); los días van en
 * la hora de Colombia, como en OrderIntentStats. Solo entran fichas
 * publicadas (las ocultas no cuentan, aunque tengan toques); el empate se
 * resuelve por nombre y, al final, por id, para que el orden sea estable.
 */
final class OrderIntentRanking
{
    /**
     * @return list<object{id: int, name: string, current: int, previous: int}>
     */
    public static function top(int $days, int $limit = 10, ?CarbonImmutable $now = null): array
    {
        $today = ($now ?? CarbonImmutable::now())->setTimezone(config()->string('app.timezone'))->startOfDay();
        $currentStart = $today->subDays($days - 1);
        $previousStart = $currentStart->subDays($days);

        /** @var Collection<int, object{id: int|string, name: string, current_total: int|string, previous_total: int|string}> $rows */
        $rows = DB::table('order_intents')
            ->join('restaurants', 'restaurants.id', '=', 'order_intents.restaurant_id')
            ->whereIn('restaurants.status', array_map(fn (RestaurantStatus $status) => $status->value, RestaurantStatus::published()))
            ->selectRaw(
                'restaurants.id, restaurants.name, '
                .'count(*) FILTER (WHERE order_intents.created_at >= ?) AS current_total, '
                .'count(*) FILTER (WHERE order_intents.created_at < ?) AS previous_total',
                [$currentStart, $currentStart],
            )
            ->where('order_intents.created_at', '>=', $previousStart)
            ->where('order_intents.created_at', '<', $today->addDay())
            ->groupBy('restaurants.id', 'restaurants.name')
            ->havingRaw('count(*) FILTER (WHERE order_intents.created_at >= ?) > 0', [$currentStart])
            ->orderByRaw('current_total DESC, previous_total DESC, restaurants.name ASC, restaurants.id ASC')
            ->limit($limit)
            ->get();

        $ranking = [];

        foreach ($rows as $row) {
            $ranking[] = (object) [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
                'current' => (int) $row->current_total,
                'previous' => (int) $row->previous_total,
            ];
        }

        return $ranking;
    }
}
