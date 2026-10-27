<?php

namespace App\Models\Concerns;

use App\Enums\ClaimStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;

/**
 * Retención de las solicitudes de #20 (ADR 0026): una vez resuelta, se borra
 * a los RETENTION_MONTHS meses con `model:prune` (routes/console.php). Las
 * pendientes se quedan hasta que administración las atienda.
 */
trait PrunedAfterReview
{
    use MassPrunable;

    public const RETENTION_MONTHS = 6;

    /** @return Builder<static> */
    public function prunable(): Builder
    {
        return static::query()
            ->where('status', '!=', ClaimStatus::Pending->value)
            ->where('reviewed_at', '<', now()->subMonths(self::RETENTION_MONTHS));
    }
}
