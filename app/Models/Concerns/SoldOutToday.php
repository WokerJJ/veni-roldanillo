<?php

namespace App\Models\Concerns;

use App\Support\BusinessDay;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * «Agotado hoy» de platos (ADR 0018) e ingredientes (ADR 0033), con una sola
 * regla: sold_out_until es el día de Colombia hasta el que no hay, incluido,
 * y a la medianoche de America/Bogota (BusinessDay), no la del servidor,
 * vuelve solo.
 *
 * Solo cambia sold_out_until: «Actualizada el…» del restaurante lo mueve
 * quien llama, una vez (Restaurant::touchOwnerUpdate).
 *
 * @property Carbon|null $sold_out_until
 */
trait SoldOutToday
{
    public function isSoldOutToday(): bool
    {
        return $this->sold_out_until !== null
            && $this->sold_out_until->toDateString() >= BusinessDay::today()->toDateString();
    }

    /** Marca o quita «agotado hoy»: vence solo a la medianoche. */
    public function setSoldOutToday(bool $soldOut): void
    {
        $this->forceFill(['sold_out_until' => $soldOut ? BusinessDay::today()->toDateString() : null])->save();
    }

    /** @param  Builder<static>  $query */
    #[Scope]
    protected function soldOutToday(Builder $query): void
    {
        $query->where($this->qualifyColumn('sold_out_until'), '>=', BusinessDay::today()->toDateString());
    }

    /** @param  Builder<static>  $query */
    #[Scope]
    protected function availableToday(Builder $query): void
    {
        $column = $this->qualifyColumn('sold_out_until');

        $query->where(fn (Builder $available) => $available
            ->whereNull($column)
            ->orWhere($column, '<', BusinessDay::today()->toDateString()));
    }
}
