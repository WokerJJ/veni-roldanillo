<?php

namespace App\Models\Concerns;

use App\Enums\ClaimStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;

/**
 * Retención de las solicitudes de #20 (ADR 0026), con `model:prune` todos los
 * días (routes/console.php), a los RETENTION_MONTHS meses de resueltas:
 *
 * - una rechazada se borra;
 * - una aprobada se anonimiza: pierde el contacto y lo que escribió la
 *   persona, y conserva la resolución (estado, quién y cuándo la revisó, de
 *   qué restaurante), que explica por qué una ficha se reclamó o se ocultó.
 *
 * Las pendientes se quedan hasta que administración las atienda.
 */
trait PrunedAfterReview
{
    use MassPrunable {
        pruneAll as private deleteRejected;
    }

    public const RETENTION_MONTHS = 6;

    /**
     * Las columnas con datos de la persona: se vacían al anonimizar.
     *
     * @return list<string>
     */
    abstract protected function personalDataColumns(): array;

    /**
     * Las rechazadas viejas: se borran.
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        return $this->reviewedLongAgo(ClaimStatus::Rejected);
    }

    /** Anonimiza las aprobadas viejas y borra las rechazadas viejas. */
    public function pruneAll(int $chunkSize = 1000): int
    {
        $columns = $this->personalDataColumns();

        $anonymized = $this->reviewedLongAgo(ClaimStatus::Approved)
            ->where(function (Builder $query) use ($columns) {
                foreach ($columns as $column) {
                    $query->orWhereNotNull($column);
                }
            })
            ->update(array_fill_keys($columns, null));

        return $anonymized + $this->deleteRejected($chunkSize);
    }

    /** @return Builder<static> */
    private function reviewedLongAgo(ClaimStatus $status): Builder
    {
        return static::query()
            ->where('status', $status->value)
            ->where('reviewed_at', '<', now()->subMonths(self::RETENTION_MONTHS));
    }
}
