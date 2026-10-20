<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * De dónde vino una ficha importada (#58, ADR 0021): la fuente, el tipo y el
 * id del objeto y la fecha de la última consulta en que estaba. Las fichas
 * propias no tienen procedencia. Nada es asignable: la escribe solo la
 * importación (App\Console\Commands\ImportOsmRestaurants).
 *
 * Larastan tipa las columnas enum de la migración como literales: las
 * propiedades de abajo las dejan como texto.
 *
 * @property string $source
 * @property string $element_type
 * @property int $element_id
 * @property string $element_kind
 * @property string $imported_hash
 */
class RestaurantSource extends Model
{
    /** Valor de `source` para OpenStreetMap, la única fuente permitida hoy. */
    public const string OPENSTREETMAP = 'openstreetmap';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'element_id' => 'integer',
            'fetched_at' => 'datetime',
            'missing_since' => 'datetime',
        ];
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    /** El objeto en openstreetmap.org, para ir a verlo. */
    public function url(): string
    {
        return "https://www.openstreetmap.org/{$this->element_type}/{$this->element_id}";
    }
}
