<?php

namespace App\Actions\Restaurants;

use App\Enums\FieldSubmissionStatus;
use App\Enums\LegalDocument;
use App\Models\FieldSubmission;
use Illuminate\Support\Facades\DB;

/**
 * La segunda firma: el dueño toca «Confirmo» (ADR 0048). Consume el código
 * (un solo uso) y deja la fecha, las versiones del aviso y de la autorización,
 * el celular al que se mandó el enlace y la huella de lo que vio. No guarda la
 * IP ni el dispositivo. Un código que no existe, venció, ya se usó o es de una
 * captura que dejó de esperar falla igual: sin pistas.
 */
final class ConfirmFieldSubmission
{
    /**
     * @throws ActionRefused
     */
    public function handle(string $code, ?string $seenHash = null): FieldSubmission
    {
        if (preg_match('/^[A-Za-z0-9_-]{43}$/', $code) !== 1) {
            throw new ActionRefused(ActionRefused::CODE_INVALID);
        }

        return DB::transaction(function () use ($code, $seenHash): FieldSubmission {
            $locked = FieldSubmission::query()
                ->lockForUpdate()
                ->where('confirmation_token_hash', FieldSubmission::hashCode($code))
                ->where('status', FieldSubmissionStatus::Submitted->value)
                ->where('confirmation_expires_at', '>', now())
                ->first();

            if ($locked === null) {
                throw new ActionRefused(ActionRefused::CODE_INVALID);
            }

            $hash = $locked->contentHash();

            // Lo que el dueño vio en pantalla tiene que ser lo que hay ahora.
            if ($seenHash !== null && ! hash_equals($hash, $seenHash)) {
                throw new ActionRefused(ActionRefused::CONTENT_CHANGED);
            }

            $locked->forceFill([
                'status' => FieldSubmissionStatus::OwnerConfirmed,
                'owner_confirmed_at' => now(),
                'owner_confirmed_hash' => $hash,
                'owner_privacy_notice_version' => LegalDocument::PRIVACY_VERSION,
                'owner_authorization_version' => FieldSubmission::AUTHORIZATION_VERSION,
                'confirmation_token_hash' => null,
            ])->save();

            return $locked;
        });
    }
}
