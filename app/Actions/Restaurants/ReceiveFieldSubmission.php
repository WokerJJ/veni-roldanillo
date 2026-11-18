<?php

namespace App\Actions\Restaurants;

use App\Enums\ClaimantRole;
use App\Enums\FieldSubmissionStatus;
use App\Models\FieldSubmission;
use App\Models\Restaurant;
use App\Models\User;
use App\Support\Field\DuplicateFinder;
use App\Support\GeoPoint;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Recibe una captura del modo Campo (ADR 0048). El identificador lo genera el
 * teléfono: repetir el envío con el mismo contenido da el mismo resultado y
 * no duplica; con otro contenido y la captura ya enviada, se rechaza; una
 * captura devuelta se reemplaza como una revisión nueva (y su confirmación
 * del dueño ya no vale). Siempre vuelve a buscar duplicados en el servidor.
 *
 * Los datos llegan validados y normalizados por StoreFieldSubmissionRequest.
 * No confía en nada del cliente que no sea el contenido: quién captura sale
 * de la sesión.
 *
 * @phpstan-import-type FieldPayload from FieldSubmission
 *
 * @phpstan-type Data array{payload: FieldPayload, latitude: float, longitude: float, location_source: string, owner_name: string, owner_role: string, owner_phone: string, captured_at: Carbon, restaurant_id: int|null, distinct_from: list<int>}
 */
final class ReceiveFieldSubmission
{
    public function __construct(private readonly DuplicateFinder $duplicates) {}

    /**
     * @param  Data  $data
     * @return array{submission: FieldSubmission, created: bool}
     *
     * @throws ActionRefused
     */
    public function handle(User $user, string $uuid, array $data): array
    {
        if (! $user->isAdmin()) {
            throw new AuthorizationException;
        }

        try {
            return DB::transaction(fn (): array => $this->apply($user, $uuid, $data));
        } catch (UniqueConstraintViolationException) {
            // Dos envíos del mismo uuid a la vez: el segundo ve la fila del primero.
            return DB::transaction(fn (): array => $this->apply($user, $uuid, $data));
        }
    }

    /**
     * @param  Data  $data
     * @return array{submission: FieldSubmission, created: bool}
     */
    private function apply(User $user, string $uuid, array $data): array
    {
        $point = new GeoPoint($data['latitude'], $data['longitude']);
        $hash = FieldSubmission::hashContent($data['payload'], $point, $data['owner_name'], $data['owner_role'], $data['owner_phone']);

        $existing = FieldSubmission::query()->lockForUpdate()->where('uuid', $uuid)->first();

        if ($existing !== null && $existing->captured_by !== $user->id) {
            throw new ActionRefused(ActionRefused::NOT_YOURS);
        }

        if ($existing !== null && $existing->status !== FieldSubmissionStatus::Returned) {
            if ($existing->payload_hash !== $hash) {
                throw new ActionRefused(ActionRefused::CONTENT_CONFLICT);
            }

            return ['submission' => $existing, 'created' => false];
        }

        $this->assertTarget($data['restaurant_id']);

        $submission = $existing ?? new FieldSubmission;
        $revising = $existing !== null;

        $submission->forceFill([
            'uuid' => $uuid,
            'status' => FieldSubmissionStatus::Submitted,
            'revision' => $revising ? $submission->revision + 1 : 1,
            'captured_by' => $user->id,
            'captured_at' => $data['captured_at'],
            'received_at' => now(),
            'payload' => $data['payload'],
            'payload_hash' => $hash,
            'location' => $point,
            'location_source' => $data['location_source'],
            'owner_name' => $data['owner_name'],
            'owner_role' => ClaimantRole::from($data['owner_role']),
            'owner_phone' => $data['owner_phone'],
            'restaurant_id' => $data['restaurant_id'],
            'confirmation_token_hash' => null,
            'confirmation_expires_at' => null,
            'confirmation_phone' => null,
            'owner_confirmed_at' => null,
            'owner_confirmed_hash' => null,
            'owner_privacy_notice_version' => null,
            'owner_authorization_version' => null,
            'duplicates' => [
                'candidates' => $this->duplicates->find($data['payload']['name'], $point, $data['restaurant_id'], $uuid),
                'distinct_from' => $data['distinct_from'],
            ],
        ])->save();

        return ['submission' => $submission, 'created' => ! $revising];
    }

    /** La ficha a completar: oculta y sin dueño (un borrador de OpenStreetMap, por ejemplo). */
    private function assertTarget(?int $restaurantId): void
    {
        if ($restaurantId === null) {
            return;
        }

        $target = Restaurant::query()->find($restaurantId);

        if ($target === null || $target->status->isPublished() || $target->owners()->exists()) {
            throw new ActionRefused(ActionRefused::INVALID_TARGET);
        }
    }
}
