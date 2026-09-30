<?php

namespace App\Models;

use Database\Factories\DishFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Plato con precio en pesos enteros. restaurant_id no es asignable: se crea
 * desde la relación del restaurante, y la FK compuesta impide que la sección
 * sea de otro restaurante.
 */
#[Fillable([
    'menu_section_id', 'name_es', 'name_en', 'description_es', 'description_en',
    'price', 'photo_path', 'tags', 'available', 'sold_out_until', 'position',
])]
class Dish extends Model
{
    /** @use HasFactory<DishFactory> */
    use HasFactory;

    /** @var array<string, mixed> */
    protected $attributes = [
        'tags' => '[]',
        'available' => true,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price' => 'integer',
            'tags' => 'array',
            'available' => 'boolean',
            'sold_out_until' => 'date',
            'position' => 'integer',
        ];
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    /** @return BelongsTo<MenuSection, $this> */
    public function menuSection(): BelongsTo
    {
        return $this->belongsTo(MenuSection::class);
    }

    /** @return HasMany<OptionGroup, $this> */
    public function optionGroups(): HasMany
    {
        return $this->hasMany(OptionGroup::class)->orderBy('position');
    }
}
