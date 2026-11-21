<?php

namespace App\Support;

use App\Enums\ClaimStatus;
use App\Enums\FieldSubmissionStatus;
use App\Enums\RestaurantStatus;
use App\Models\FieldSubmission;
use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use Illuminate\Support\Facades\DB;

/**
 * Estado del catálogo (Escritorio de administración): cuántas fichas hay
 * publicadas (sin reclamar y reclamadas), cuántas ocultas y cuántas
 * solicitudes esperan una decisión. Cuatro conteos sobre columnas que ya
 * tienen índice (status; status + created_at).
 */
final readonly class CatalogOverview
{
    private function __construct(
        public int $unclaimed,
        public int $claimed,
        public int $hidden,
        public int $pendingClaims,
        public int $pendingRemovals,
        public int $openFieldSubmissions,
    ) {}

    public static function current(): self
    {
        /** @var array<string, int|string> $byStatus */
        $byStatus = DB::table('restaurants')->selectRaw('status, count(*) AS total')->groupBy('status')->pluck('total', 'status')->all();

        $open = array_values(array_map(
            fn (FieldSubmissionStatus $status) => $status->value,
            array_filter(FieldSubmissionStatus::cases(), fn (FieldSubmissionStatus $status) => $status->isOpen()),
        ));

        return new self(
            unclaimed: (int) ($byStatus[RestaurantStatus::Unclaimed->value] ?? 0),
            claimed: (int) ($byStatus[RestaurantStatus::Claimed->value] ?? 0),
            hidden: (int) ($byStatus[RestaurantStatus::Hidden->value] ?? 0),
            pendingClaims: RestaurantClaim::query()->where('status', ClaimStatus::Pending)->count(),
            pendingRemovals: RestaurantRemovalRequest::query()->where('status', ClaimStatus::Pending)->count(),
            openFieldSubmissions: FieldSubmission::query()->whereIn('status', $open)->count(),
        );
    }

    public function published(): int
    {
        return $this->unclaimed + $this->claimed;
    }
}
