<?php

namespace App\Actions\Restaurants;

use App\Models\User;
use SensitiveParameter;

/**
 * Resultado de aprobar un reclamo: la cuenta del dueño y, si se creó en ese
 * momento, su contraseña temporal. El panel la muestra una sola vez; no se
 * guarda en claro en ningún lado (en users va su hash).
 */
final readonly class ApprovedClaim
{
    public function __construct(
        public User $owner,
        #[SensitiveParameter] public ?string $temporaryPassword,
    ) {}

    public function createdAccount(): bool
    {
        return $this->temporaryPassword !== null;
    }
}
