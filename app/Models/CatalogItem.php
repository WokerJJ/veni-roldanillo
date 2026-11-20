<?php

namespace App\Models;

use App\Models\Concerns\HasTranslatableFields;
use App\Policies\CatalogPolicy;
use Database\Factories\CatalogItemFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Un producto del catálogo (ADR 0049): «Manzana» de la marca «Postobón», o
 * «Jugo de mora». El nombre del plato es el del producto, su marca y su
 * presentación (`dishName`). Solo texto: nunca logos ni imágenes de marca.
 */
#[UsePolicy(CatalogPolicy::class)]
#[Fillable(['group_id', 'brand', 'name_es', 'name_en', 'is_alcohol', 'active', 'position'])]
class CatalogItem extends Model
{
    /** @use HasFactory<CatalogItemFactory> */
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
        return ['name'];
    }

    /**
     * El nombre de un plato: producto, marca y presentación («Manzana Postobón
     * 400 ml»). La marca no se repite si el producto ya la nombra («Cerveza
     * Águila» de la marca «Águila» queda «Cerveza Águila 330 ml»). Lo mismo hace
     * resources/campo/catalog.ts en el teléfono: el nombre que se ve al capturar
     * es el que se guarda.
     */
    public static function dishName(string $name, ?string $brand, ?string $label): string
    {
        $brand = $brand === null || trim($brand) === '' || mb_stripos($name, trim($brand)) !== false ? null : trim($brand);

        return trim(implode(' ', array_filter([$name, $brand, $label], fn (?string $part): bool => $part !== null && trim($part) !== '')));
    }

    /** @return BelongsTo<CatalogGroup, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(CatalogGroup::class, 'group_id');
    }

    /** @return HasMany<CatalogVariant, $this> */
    public function variants(): HasMany
    {
        return $this->hasMany(CatalogVariant::class, 'item_id');
    }
}
