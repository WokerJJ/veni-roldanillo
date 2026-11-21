<?php

namespace App\Support;

use App\Enums\RestaurantStatus;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Frescura de los menús (Escritorio de administración): por cada restaurante
 * publicado, cuándo fue la última vez que alguien tocó su carta o su
 * «Almuerzo de hoy», del más viejo al más reciente. Sirve para ver quién
 * abandonó Vení.
 *
 * La última actividad es el mayor updated_at entre sus platos, sus secciones
 * de la carta y sus almuerzos del día. No mide a nadie: son datos que la carta
 * ya guarda. Marcar un plato como agotado también mueve el updated_at del
 * plato, y cuenta (es mantener el menú al día). Un restaurante sin nada
 * cargado sale primero, con last_at nulo.
 *
 * Los días se cuentan en fechas de Colombia (app.timezone): lo de las 11 p. m.
 * de ayer son «1 día», no «0».
 */
final class MenuFreshness
{
    /**
     * @return list<object{id: int, name: string, status: RestaurantStatus, fictitious: bool, last_at: CarbonImmutable|null, days: int|null}>
     */
    public static function rows(?CarbonImmutable $now = null): array
    {
        $timezone = config()->string('app.timezone');
        $today = ($now ?? CarbonImmutable::now())->setTimezone($timezone)->startOfDay();

        $latest = static fn (string $table) => DB::table($table)
            ->select('restaurant_id')
            ->selectRaw('max(updated_at) AS last_at')
            ->groupBy('restaurant_id');

        /** @var Collection<int, object{id: int|string, name: string, status: string, is_fictitious: bool|int, last_at: string|null}> $rows */
        $rows = DB::table('restaurants')
            ->leftJoinSub($latest('dishes'), 'd', 'd.restaurant_id', '=', 'restaurants.id')
            ->leftJoinSub($latest('menu_sections'), 's', 's.restaurant_id', '=', 'restaurants.id')
            ->leftJoinSub($latest('daily_menus'), 'm', 'm.restaurant_id', '=', 'restaurants.id')
            ->whereIn('restaurants.status', array_map(fn (RestaurantStatus $status) => $status->value, RestaurantStatus::published()))
            ->selectRaw('restaurants.id, restaurants.name, restaurants.status, restaurants.is_fictitious, GREATEST(d.last_at, s.last_at, m.last_at) AS last_at')
            ->orderByRaw('last_at ASC NULLS FIRST, restaurants.name ASC, restaurants.id ASC')
            ->get();

        $result = [];

        foreach ($rows as $row) {
            $lastAt = $row->last_at === null ? null : CarbonImmutable::parse($row->last_at)->setTimezone($timezone);

            $result[] = (object) [
                'id' => (int) $row->id,
                'name' => (string) $row->name,
                'status' => RestaurantStatus::from($row->status),
                'fictitious' => (bool) $row->is_fictitious,
                'last_at' => $lastAt,
                'days' => $lastAt === null ? null : max(0, (int) $lastAt->startOfDay()->diffInDays($today)),
            ];
        }

        return $result;
    }
}
