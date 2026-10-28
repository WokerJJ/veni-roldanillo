<?php

namespace App\Actions\Restaurants;

use App\Models\User;
use SensitiveParameter;

/**
 * Resultado de aprobar un reclamo: la cuenta nueva del dueño y su contraseña
 * temporal. El panel la muestra una sola vez, en un modal que la olvida al
 * cerrarse; no se guarda en claro en ningún lado (en users va su hash) ni
 * pasa por los avisos de Filament, que se guardan en la caché.
 */
final readonly class ApprovedClaim
{
    public function __construct(
        public User $owner,
        #[SensitiveParameter] public string $temporaryPassword,
    ) {}
}
