<?php

namespace App\Http\Controllers\Field;

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Restaurants\IssueConfirmationLink;
use App\Actions\Restaurants\ReceiveFieldSubmission;
use App\Enums\FieldSubmissionStatus;
use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Http\Requests\Field\DuplicateLookupRequest;
use App\Http\Requests\Field\StoreFieldSubmissionRequest;
use App\Models\Category;
use App\Models\FieldSubmission;
use App\Models\User;
use App\Support\Field\ConfirmationMessage;
use App\Support\Field\DuplicateFinder;
use App\Support\GeoPoint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;

/**
 * La API JSON del modo Campo (ADR 0048): solo para administración, con la
 * sesión y el CSRF de siempre. Todo cuelga de la cuenta de la sesión: el
 * cliente nunca dice quién captura, y un identificador de otra cuenta es 404.
 */
class FieldSubmissionController extends Controller
{
    /** Lo que el shell necesita para abrir y para trabajar sin señal. */
    public function me(Request $request): JsonResponse
    {
        Gate::authorize('create', FieldSubmission::class);

        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'user' => ['id' => $user->id, 'name' => $user->name],
            'csrf' => csrf_token(),
            'categories' => Category::query()->orderBy('position')->get(['id', 'slug', 'name_es', 'name_en'])
                ->map(fn (Category $c): array => ['id' => $c->id, 'slug' => $c->slug, 'name_es' => $c->name_es, 'name_en' => $c->name_en])->all(),
            'payment_methods' => array_map(fn (PaymentMethod $m): string => $m->value, PaymentMethod::cases()),
            'bounds' => [
                'lat' => [StoreFieldSubmissionRequest::LAT_MIN, StoreFieldSubmissionRequest::LAT_MAX],
                'lng' => [StoreFieldSubmissionRequest::LNG_MIN, StoreFieldSubmissionRequest::LNG_MAX],
            ],
        ]);
    }

    /** Duplicados posibles antes de enviar (con señal). */
    public function duplicates(DuplicateLookupRequest $request, DuplicateFinder $finder): JsonResponse
    {
        return response()->json([
            'candidates' => $finder->find(
                $request->string('name')->trim()->toString(),
                new GeoPoint($request->float('latitude'), $request->float('longitude')),
                null,
                $request->filled('uuid') ? $request->string('uuid')->toString() : null,
            ),
        ]);
    }

    /** Las capturas de esta cuenta, con su estado; las devueltas traen el contenido para corregirlas. */
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('create', FieldSubmission::class);

        $submissions = FieldSubmission::query()
            ->where('captured_by', $request->user()?->id)
            ->latest('received_at')
            ->latest('id')
            ->limit(200)
            ->get();

        return response()->json(['submissions' => $submissions->map(fn (FieldSubmission $s): array => $this->present($s, withContent: $s->status === FieldSubmissionStatus::Returned))->all()]);
    }

    /** Recibe o reenvía una captura: idempotente por el uuid del teléfono. */
    public function store(StoreFieldSubmissionRequest $request, string $uuid, ReceiveFieldSubmission $receive): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        try {
            $result = $receive->handle($user, $uuid, $request->submission());
        } catch (ActionRefused $refused) {
            return $this->refused($refused);
        }

        return response()->json($this->present($result['submission']), $result['created'] ? 201 : 200);
    }

    /** El enlace de un solo uso para el dueño y el mensaje de WhatsApp que lo lleva. */
    public function confirmationLink(Request $request, string $uuid, IssueConfirmationLink $issue): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $submission = $this->own($user, $uuid);

        Gate::authorize('update', $submission);

        try {
            $code = $issue->handle($submission, $user);
        } catch (ActionRefused $refused) {
            return $this->refused($refused);
        }

        $url = route('field.confirm.show', ['code' => $code]);
        $submission->refresh();

        return response()->json([
            'url' => $url,
            'expires_at' => $submission->confirmation_expires_at?->toIso8601String(),
            'whatsapp_url' => ConfirmationMessage::whatsappUrl($submission, $url),
        ]);
    }

    private function own(User $user, string $uuid): FieldSubmission
    {
        return FieldSubmission::query()->where('uuid', $uuid)->where('captured_by', $user->id)->firstOrFail();
    }

    private function refused(ActionRefused $refused): JsonResponse
    {
        // Cada motivo con su estado, a propósito: un motivo nuevo no queda en un 409
        // por accidente. Los de aquí son los que salen de recibir y de pedir el enlace.
        [$status, $field] = match ($refused->reason) {
            ActionRefused::NOT_YOURS => [404, null],
            ActionRefused::INVALID_TARGET => [422, 'restaurant_id'],
            ActionRefused::CONTENT_CONFLICT,
            ActionRefused::CONTENT_UNCHANGED,
            ActionRefused::NOT_OPEN => [409, null],
            default => $this->unmapped($refused),
        };

        return response()->json(
            ['message' => $refused->reason, 'errors' => $field === null ? (object) [] : [$field => [$refused->reason]]],
            $status,
        );
    }

    /**
     * Un motivo que esta API no esperaba: se anota (solo el motivo, nunca datos
     * de la captura ni del dueño) y responde 409.
     *
     * @return array{int, null}
     */
    private function unmapped(ActionRefused $refused): array
    {
        Log::warning('Modo Campo: motivo de rechazo sin estado propio.', ['reason' => $refused->reason]);

        return [409, null];
    }

    /**
     * @return array<string, mixed>
     */
    private function present(FieldSubmission $submission, bool $withContent = false): array
    {
        $data = [
            'uuid' => $submission->uuid,
            'status' => $submission->status->value,
            'revision' => $submission->revision,
            'name' => $submission->payload['name'],
            'received_at' => $submission->received_at->toIso8601String(),
            'owner_confirmed_at' => $submission->owner_confirmed_at?->toIso8601String(),
            'link_expires_at' => $submission->confirmation_expires_at?->toIso8601String(),
            'review_note' => $submission->review_note,
            'duplicates' => $submission->duplicates['candidates'] ?? [],
        ];

        if ($withContent) {
            $data['content'] = [
                ...$submission->payload,
                'latitude' => $submission->location->latitude,
                'longitude' => $submission->location->longitude,
                'location_source' => $submission->location_source,
                'owner_name' => $submission->owner_name,
                'owner_role' => $submission->owner_role->value,
                'owner_phone' => $submission->owner_phone,
                'restaurant_id' => $submission->restaurant_id,
                'distinct_from' => $submission->duplicates['distinct_from'] ?? [],
            ];
        }

        return $data;
    }
}
