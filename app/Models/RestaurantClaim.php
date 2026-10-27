<?php

namespace App\Models;

use App\Enums\ClaimantRole;
use App\Enums\ClaimStatus;
use App\Models\Concerns\PrunedAfterReview;
use App\Policies\RestaurantRequestPolicy;
use Database\Factories\RestaurantClaimFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Solicitud «¿Es tu negocio? Reclámalo». Quien reclama no tiene cuenta (#20,
 * ADR 0026): deja un contacto mínimo y administración la verifica a mano; al
 * aprobarla crea la cuenta y la enlaza en user_id. Son asignables el contacto
 * y el mensaje; el restaurante sale de la ruta, y la autorización de datos,
 * la cuenta y la resolución las fija el servidor.
 *
 * Larastan tipa las columnas enum de la migración como literales e ignora el
 * cast; los @property fijan el tipo del enum PHP.
 *
 * @property ClaimStatus $status
 * @property ClaimantRole|null $claimant_role
 */
#[UsePolicy(RestaurantRequestPolicy::class)]
#[Fillable(['contact_name', 'contact_phone', 'contact_email', 'claimant_role', 'message'])]
class RestaurantClaim extends Model
{
    /** @use HasFactory<RestaurantClaimFactory> */
    use HasFactory;

    use PrunedAfterReview;

    /**
     * Índice único parcial «una pendiente por restaurante y celular»: el
     * controlador solo absorbe la violación de este (ADR 0026).
     */
    public const string PENDING_UNIQUE_INDEX = 'restaurant_claims_one_pending_contact';

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
            'claimant_role' => ClaimantRole::class,
            'privacy_accepted_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    /** @return list<string> */
    protected function personalDataColumns(): array
    {
        return ['contact_name', 'contact_phone', 'contact_email', 'message', 'review_note'];
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<User, $this> */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
