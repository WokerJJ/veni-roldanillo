<?php

namespace App\Actions\Restaurants;

use App\Enums\FieldSubmissionStatus;
use App\Models\FieldSubmission;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;

/**
 * Devuelve o rechaza una captura del modo Campo (ADR 0048), con un motivo.
 * Devolver la deja editable en el teléfono y borra la confirmación del dueño
 * (lo corregido se confirma de nuevo); rechazar es definitivo. Solo
 * administración, solo mientras la captura espera una decisión.
 */
final class CloseFieldSubmission
{
    public const int NOTE_MAX = 500;

    /**
     * @throws ActionRefused
     */
    public function sendBack(FieldSubmission $submission, User $reviewer, string $note): void
    {
        $this->close($submission, $reviewer, $note, FieldSubmissionStatus::Returned);
    }

    /**
     * @throws ActionRefused
     */
    public function reject(FieldSubmission $submission, User $reviewer, string $note): void
    {
        $this->close($submission, $reviewer, $note, FieldSubmissionStatus::Rejected);
    }

    private function close(FieldSubmission $submission, User $reviewer, string $note, FieldSubmissionStatus $target): void
    {
        if (! $reviewer->isAdmin()) {
            throw new AuthorizationException;
        }

        $note = trim($note);

        if ($note === '' || mb_strlen($note) > self::NOTE_MAX) {
            throw new ActionRefused(ActionRefused::MISSING_NOTE);
        }

        DB::transaction(function () use ($submission, $reviewer, $note, $target): void {
            $locked = FieldSubmission::query()->lockForUpdate()->whereKey($submission->getKey())->firstOrFail();

            if (! $locked->status->isOpen()) {
                throw new ActionRefused(ActionRefused::NOT_OPEN);
            }

            $locked->forceFill([
                'status' => $target,
                'review_note' => $note,
                'reviewed_by' => $reviewer->getKey(),
                'reviewed_at' => now(),
                'confirmation_token_hash' => null,
                'confirmation_expires_at' => null,
                'confirmation_phone' => null,
                'owner_confirmed_at' => null,
                'owner_confirmed_hash' => null,
                'owner_privacy_notice_version' => null,
                'owner_authorization_version' => null,
            ])->save();

            $submission->setRawAttributes($locked->getAttributes(), sync: true);
        });
    }
}
