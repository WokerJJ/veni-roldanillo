<?php

namespace App\Models;

use Database\Factories\SpecialHourFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Horario de una fecha concreta (festivo, cierre temporal) que reemplaza al semanal.
 */
#[Fillable(['on_date', 'closed', 'opens_at', 'closes_at', 'note_es', 'note_en'])]
class SpecialHour extends Model
{
    /** @use HasFactory<SpecialHourFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'on_date' => 'date',
            'closed' => 'boolean',
        ];
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }
}
