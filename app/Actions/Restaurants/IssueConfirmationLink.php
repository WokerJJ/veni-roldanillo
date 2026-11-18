<?php

namespace App\Actions\Restaurants;

use App\Enums\FieldSubmissionStatus;
use App\Models\FieldSubmission;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;

/**
 * Genera el enlace de un solo uso con que el dueño confirma una captura (ADR
 * 0048). Devuelve el código en claro una sola vez: la base guarda solo su
 * SHA-256 y pedir otro invalida el anterior.
 */
final class IssueConfirmationLink
{
    /**
     * @throws ActionRefused
     */
    public function handle(FieldSubmission $submission, User $user): string
    {
        if (! $user->isAdmin() || $submission->captured_by !== $user->id) {
            throw new AuthorizationException;
        }

        return DB::transaction(function () use ($submission): string {
            $locked = FieldSubmission::query()->lockForUpdate()->whereKey($submission->getKey())->firstOrFail();

            if ($locked->status !== FieldSubmissionStatus::Submitted) {
                throw new ActionRefused(ActionRefused::NOT_OPEN);
            }

            $code = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');

            $locked->forceFill([
                'confirmation_token_hash' => FieldSubmission::hashCode($code),
                'confirmation_expires_at' => now()->addDays(FieldSubmission::CONFIRMATION_DAYS),
                'confirmation_phone' => $locked->owner_phone,
            ])->save();

            return $code;
        });
    }
}
