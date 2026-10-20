<?php

namespace App\Support\Osm;

use App\Enums\RestaurantStatus;
use App\Models\Category;
use App\Models\Restaurant;
use App\Models\RestaurantSource;
use App\Support\GeoPoint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Convierte los locales de OpenStreetMap en fichas ocultas (ADR 0021).
 *
 * Por cada objeto: si es nuevo, crea la ficha oculta con nombre, categoría y
 * punto y guarda su procedencia. Si ya se importó, la actualiza solo mientras
 * siga como la dejó la importación: oculta, sin verificar, sin cambios del
 * dueño y con la misma huella. Lo que no tiene nombre no se importa. Los
 * objetos que ya no vienen quedan marcados, sin borrar ni ocultar nada.
 *
 * Con $dryRun hace lo mismo dentro de una transacción que se deshace: la
 * cuenta es la que daría la corrida de verdad.
 */
class OsmImporter
{
    /**
     * @param  list<array<mixed>>  $elements  los elementos de Overpass
     */
    public function import(array $elements, bool $dryRun = false): OsmImportReport
    {
        $report = new OsmImportReport;
        $now = Carbon::now();

        DB::beginTransaction();

        try {
            $categories = $this->categories();
            $seen = [];

            foreach ($elements as $element) {
                $place = OsmPlace::fromElement($element);

                if ($place === null) {
                    $report->ignored++;

                    continue;
                }

                if (isset($seen[$place->type][$place->id])) {
                    continue;
                }

                $seen[$place->type][$place->id] = true;
                $this->importPlace($place, $categories[$place->category()], $now, $report);
            }

            $this->markMissing($seen, $now, $report);

            $dryRun ? DB::rollBack() : DB::commit();
        } catch (\Throwable $error) {
            DB::rollBack();

            throw $error;
        }

        return $report;
    }

    /**
     * La huella de lo que la importación escribe en una ficha: si después
     * otra cosa cambia el nombre, el punto o la categoría, ya no coincide.
     *
     * @param  list<string>  $categories  slugs
     */
    public static function fingerprint(string $name, GeoPoint $point, array $categories): string
    {
        sort($categories);

        return hash('sha256', (string) json_encode([
            $name,
            sprintf('%.7F', $point->latitude),
            sprintf('%.7F', $point->longitude),
            $categories,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }

    private function importPlace(OsmPlace $place, Category $category, Carbon $now, OsmImportReport $report): void
    {
        if ($place->name === null) {
            $report->unnamed[] = $place;

            return;
        }

        $source = RestaurantSource::query()
            ->with('restaurant.categories:id,slug')
            ->where('source', RestaurantSource::OPENSTREETMAP)
            ->where('element_type', $place->type)
            ->where('element_id', $place->id)
            ->first();

        $hash = self::fingerprint($place->name, $place->point, [$category->slug]);

        if ($source === null) {
            $this->create($place, $category, $hash, $now);
            $report->created++;

            return;
        }

        /** @var Restaurant $restaurant */
        $restaurant = $source->restaurant;
        $source->forceFill(['fetched_at' => $now, 'missing_since' => null, 'element_kind' => $place->kind]);

        if (! $this->untouched($restaurant, $source)) {
            $source->save();
            $report->skipped[] = $restaurant->name;

            return;
        }

        if ($hash === $source->imported_hash) {
            $source->save();
            $report->unchanged++;

            return;
        }

        $restaurant->forceFill(['name' => $place->name, 'location' => $place->point])->save();
        $restaurant->categories()->sync([$category->id]);
        $source->forceFill(['imported_hash' => $hash])->save();
        $report->updated++;
    }

    private function create(OsmPlace $place, Category $category, string $hash, Carbon $now): void
    {
        /** @var string $name */
        $name = $place->name;

        $restaurant = new Restaurant;
        $restaurant->forceFill([
            'name' => $name,
            'slug' => $this->uniqueSlug($name),
            'location' => $place->point,
            'status' => RestaurantStatus::Hidden,
        ])->save();
        $restaurant->categories()->attach($category->id);

        $source = new RestaurantSource;
        $source->forceFill([
            'restaurant_id' => $restaurant->id,
            'source' => RestaurantSource::OPENSTREETMAP,
            'element_type' => $place->type,
            'element_id' => $place->id,
            'element_kind' => $place->kind,
            'fetched_at' => $now,
            'imported_hash' => $hash,
        ])->save();
    }

    /**
     * La ficha sigue como la dejó la importación: nadie la publicó, la
     * verificó, la tocó su dueño ni le cambió nombre, punto o categorías.
     */
    private function untouched(Restaurant $restaurant, RestaurantSource $source): bool
    {
        if ($restaurant->status !== RestaurantStatus::Hidden
            || $restaurant->verified_at !== null
            || $restaurant->updated_by_owner_at !== null) {
            return false;
        }

        /** @var list<string> $slugs */
        $slugs = $restaurant->categories->pluck('slug')->all();

        return self::fingerprint($restaurant->name, $restaurant->location, $slugs) === $source->imported_hash;
    }

    /**
     * Marca los objetos que ya no vinieron y los lista todos (los de esta
     * corrida y los que ya faltaban).
     *
     * @param  array<string, array<int, true>>  $seen
     */
    private function markMissing(array $seen, Carbon $now, OsmImportReport $report): void
    {
        $sources = RestaurantSource::query()
            ->with('restaurant:id,name,slug,status')
            ->where('source', RestaurantSource::OPENSTREETMAP)
            ->orderBy('id')
            ->get();

        foreach ($sources as $source) {
            if (isset($seen[$source->element_type][$source->element_id])) {
                continue;
            }

            if ($source->missing_since === null) {
                $source->forceFill(['missing_since' => $now])->save();
            }

            $report->missing[] = $source;
        }
    }

    /**
     * Las categorías del mapeo, creando las que falten al final del catálogo.
     *
     * @return array<string, Category>
     */
    private function categories(): array
    {
        $categories = [];

        foreach (OsmPlace::CATEGORIES as $slug => [$es, $en]) {
            $last = Category::query()->max('position');

            $categories[$slug] = Category::query()->firstOrCreate(['slug' => $slug], [
                'name_es' => $es,
                'name_en' => $en,
                'position' => is_numeric($last) ? (int) $last + 1 : 0,
            ]);
        }

        return $categories;
    }

    /** Slug del nombre; si ya existe, con -2, -3… */
    private function uniqueSlug(string $name): string
    {
        $base = Str::limit(Str::slug($name), 120, '');
        $base = trim($base, '-');

        if ($base === '') {
            $base = 'local';
        }

        $slug = $base;

        for ($n = 2; Restaurant::query()->where('slug', $slug)->exists(); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }
}
