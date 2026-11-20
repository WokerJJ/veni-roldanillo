<?php

namespace App\Models;

use App\Models\Concerns\HasTranslatableFields;
use App\Policies\CatalogPolicy;
use Database\Factories\CatalogGroupFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Un grupo del catálogo del modo Campo (ADR 0049): gaseosas, jugos, cervezas,
 * jugos naturales, adicionales… Dice qué sección del menú crea al aprobar y si
 * sus productos son, por defecto, bebidas alcohólicas. Solo texto.
 */
#[UsePolicy(CatalogPolicy::class)]
#[Fillable(['slug', 'name_es', 'name_en', 'section_name_es', 'section_name_en', 'is_alcohol', 'active', 'position'])]
class CatalogGroup extends Model
{
    /** @use HasFactory<CatalogGroupFactory> */
    use HasFactory, HasTranslatableFields;

    /** @var array<string, mixed> */
    protected $attributes = [
        'is_alcohol' => false,
        'active' => true,
        'position' => 0,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_alcohol' => 'boolean',
            'active' => 'boolean',
            'position' => 'integer',
        ];
    }

    /** @return list<string> */
    public function translatableFields(): array
    {
        return ['name', 'section_name'];
    }

    /** @return HasMany<CatalogItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(CatalogItem::class, 'group_id');
    }
}
