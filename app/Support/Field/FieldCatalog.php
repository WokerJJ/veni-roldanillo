<?php

namespace App\Support\Field;

use App\Models\CatalogGroup;
use App\Models\CatalogItem;
use App\Models\CatalogVariant;
use Illuminate\Database\Eloquent\Relations\Relation;

/**
 * El catálogo tal como viaja al teléfono en `GET /campo/api/me` (ADR 0049):
 * solo lo activo, con una versión (huella de su contenido) para que `/campo`
 * lo guarde en el dispositivo y lo reemplace solo cuando cambia. Solo texto.
 */
final class FieldCatalog
{
    /**
     * @return array{version: string, groups: array<int, array<string, mixed>>}
     */
    public static function forDevice(): array
    {
        $groups = CatalogGroup::query()
            ->where('active', true)
            ->with([
                'items' => fn (Relation $items) => $items->where('active', true)->orderBy('position')->orderBy('id'),
                'items.variants' => fn (Relation $variants) => $variants->where('active', true)->orderBy('position')->orderBy('id'),
            ])
            ->orderBy('position')->orderBy('id')
            ->get()
            ->map(fn (CatalogGroup $group): array => [
                'id' => $group->id,
                'slug' => $group->slug,
                'name_es' => $group->name_es,
                'name_en' => $group->name_en,
                'section_name_es' => $group->section_name_es,
                'section_name_en' => $group->section_name_en,
                'is_alcohol' => $group->is_alcohol,
                'items' => $group->items->map(fn (CatalogItem $item): array => [
                    'id' => $item->id,
                    'brand' => $item->brand,
                    'name_es' => $item->name_es,
                    'name_en' => $item->name_en,
                    'is_alcohol' => $item->is_alcohol,
                    'variants' => $item->variants->map(fn (CatalogVariant $variant): array => [
                        'id' => $variant->id,
                        'label' => $variant->label,
                    ])->all(),
                ])->all(),
            ])
            ->all();

        return ['version' => substr(hash('sha256', json_encode($groups, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)), 0, 16), 'groups' => $groups];
    }
}
