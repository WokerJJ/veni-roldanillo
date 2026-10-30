<?php

namespace App\Models;

use App\Enums\Fulfillment;
use Database\Factories\OrderIntentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Un toque en «Enviar pedido por WhatsApp» (#22, ADR 0031). Guarda solo el
 * restaurante, la hora y si era a domicilio o para recoger: ni el contenido
 * del pedido, ni el total, ni dirección, ni nombre, ni ubicación, ni un
 * identificador del dispositivo o de la persona (user_id y device_hash
 * quedan nulos en este flujo). Sirve para las estadísticas del dueño.
 *
 * Se borra a los RETENTION_MONTHS meses (model:prune, routes/console.php):
 * alcanza para comparar un mes con el mismo del año anterior.
 */
#[Fillable(['fulfillment', 'confirmed'])]
class OrderIntent extends Model
{
    /** @use HasFactory<OrderIntentFactory> */
    use HasFactory, MassPrunable;

    /** Meses que se conserva cada registro. */
    public const RETENTION_MONTHS = 13;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'fulfillment' => Fulfillment::class,
            'confirmed' => 'boolean',
        ];
    }

    /** @return Builder<self> */
    public function prunable(): Builder
    {
        return static::query()->where('created_at', '<', now()->subMonths(self::RETENTION_MONTHS));
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
}
