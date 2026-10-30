<?php

namespace App\Support;

use App\Enums\Fulfillment;
use App\Models\OrderIntent;
use App\Models\Restaurant;
use Carbon\CarbonImmutable;

/**
 * Las estadísticas del dueño (#22, ADR 0031): cuántas veces se tocó «Enviar
 * pedido por WhatsApp» en los últimos $days días, día por día, contra los
 * $days anteriores, y cuántos eran a domicilio o para recoger.
 *
 * Una sola consulta agregada por restaurante, que recorre el índice
 * (restaurant_id, created_at) desde el primer día del período anterior. Los
 * días van en la hora de Colombia (app.timezone): un clic de las 11 p. m.
 * cuenta en ese día, no en el siguiente de UTC.
 */
final readonly class OrderIntentStats
{
    /** Períodos que ofrece el panel, en días. */
    public const PERIODS = [7, 30];

    /**
     * @param  array<string, int>  $perDay  Fecha (Y-m-d) => clics, del más viejo al de hoy, con los días en cero.
     */
    private function __construct(
        public int $days,
        public int $current,
        public int $previous,
        public array $perDay,
        public int $delivery,
        public int $pickup,
    ) {}

    public static function for(Restaurant $restaurant, int $days, ?CarbonImmutable $now = null): self
    {
        $timezone = (string) config('app.timezone');
        $today = ($now ?? CarbonImmutable::now())->setTimezone($timezone)->startOfDay();
        $currentStart = $today->subDays($days - 1);
        $previousStart = $currentStart->subDays($days);
        $end = $today->addDay();

        /** @var list<object{day: string, fulfillment: string|null, total: int|string}> $rows */
        $rows = OrderIntent::query()
            ->toBase()
            ->selectRaw('(created_at AT TIME ZONE ?)::date AS day, fulfillment, count(*) AS total', [$timezone])
            ->where('restaurant_id', $restaurant->getKey())
            ->where('created_at', '>=', $previousStart)
            ->where('created_at', '<', $end)
            ->groupByRaw('1, 2')
            ->get()
            ->all();

        $perDay = [];

        for ($day = $currentStart; $day->lessThan($end); $day = $day->addDay()) {
            $perDay[$day->toDateString()] = 0;
        }

        $previous = 0;
        $delivery = 0;
        $pickup = 0;

        foreach ($rows as $row) {
            $count = (int) $row->total;

            if (! array_key_exists($row->day, $perDay)) {
                $previous += $count;

                continue;
            }

            $perDay[$row->day] += $count;

            if ($row->fulfillment === Fulfillment::Delivery->value) {
                $delivery += $count;
            } elseif ($row->fulfillment === Fulfillment::Pickup->value) {
                $pickup += $count;
            }
        }

        return new self($days, array_sum($perDay), $previous, $perDay, $delivery, $pickup);
    }

    /** Cambio contra el período anterior, en porcentaje entero; null si antes no hubo ninguno. */
    public function change(): ?int
    {
        if ($this->previous === 0) {
            return null;
        }

        return (int) round(($this->current - $this->previous) * 100 / $this->previous);
    }

    /** El día con más clics del período (para escalar las barras); al menos 1. */
    public function peak(): int
    {
        return max(1, ...array_values($this->perDay));
    }
}
