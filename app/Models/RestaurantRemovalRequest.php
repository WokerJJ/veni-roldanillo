<?php

namespace App\Models;

use App\Enums\ClaimStatus;
use App\Enums\RemovalRelationship;
use App\Models\Concerns\PrunedAfterReview;
use App\Policies\RestaurantRequestPolicy;
use Database\Factories\RestaurantRemovalRequestFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * «Pedir que retiren esta ficha» (#20, ADR 0026). Guardarla no oculta la
 * ficha: la revisa administración a mano (#19). El restaurante sale de la
 * ruta, y la autorización de datos y la resolución no son asignables.
 * Tiene el mismo ciclo que un reclamo (pendiente, aprobada o rechazada).
 *
 * @property ClaimStatus $status
 * @property RemovalRelationship $relationship
 */
#[UsePolicy(RestaurantRequestPolicy::class)]
#[Fillable(['contact_name', 'contact_phone', 'contact_email', 'relationship', 'reason'])]
class RestaurantRemovalRequest extends Model
{
    /** @use HasFactory<RestaurantRemovalRequestFactory> */
    use HasFactory;

    use PrunedAfterReview;

    /**
     * Índice único parcial «una pendiente por restaurante y celular»: el
     * controlador solo absorbe la violación de este (ADR 0026).
     */
    public const string PENDING_UNIQUE_INDEX = 'restaurant_removal_requests_one_pending';

    /** @var array<string, mixed> */
    protected $attributes = [
        'status' => 'pending',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => ClaimStatus::class,
            'relationship' => RemovalRelationship::class,
            'privacy_accepted_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    /** @return list<string> */
    protected function personalDataColumns(): array
    {
        return ['contact_name', 'contact_phone', 'contact_email', 'reason', 'review_note'];
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    /** @return BelongsTo<User, $this> */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
