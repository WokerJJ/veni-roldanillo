<?php

namespace App\Models;

use App\Policies\CatalogPolicy;
use Database\Factories\CatalogVariantFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Una presentación de un producto del catálogo (ADR 0049): «400 ml», «1,5 L»,
 * «Vaso», «Jarra». Su precio no está aquí: lo dicta el dueño en cada local.
 */
#[UsePolicy(CatalogPolicy::class)]
#[Fillable(['item_id', 'label', 'active', 'position'])]
class CatalogVariant extends Model
{
    /** @use HasFactory<CatalogVariantFactory> */
    use HasFactory;

    /** @var array<string, mixed> */
    protected $attributes = [
        'active' => true,
        'position' => 0,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'position' => 'integer',
        ];
    }

    /** @return BelongsTo<CatalogItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(CatalogItem::class, 'item_id');
    }
}
