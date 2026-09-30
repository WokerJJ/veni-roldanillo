<?php

namespace App\Models;

use Database\Factories\OrderIntentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Clic en «Pedir por WhatsApp» (ADR 0004). No guarda dirección, contenido del
 * pedido ni ubicación: solo el restaurante, quién (si inició sesión) y si
 * después confirmó que pidió.
 */
#[Fillable(['confirmed'])]
class OrderIntent extends Model
{
    /** @use HasFactory<OrderIntentFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'confirmed' => 'boolean',
        ];
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
