<?php

namespace App\Support\Osm;

use App\Enums\RestaurantStatus;
use App\Models\Category;
use App\Models\Restaurant;
use App\Models\RestaurantSource;
use App\Support\GeoPoint;
use App\Support\RestaurantSlug;
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
 * Si la consulta fue por el recuadro, que también cubre parte de los
 * municipios vecinos, solo actualiza lo ya importado: no crea fichas ni
 * marca como ido lo que no vino.
 *
 * Con $dryRun hace lo mismo dentro de una transacción que se deshace: la
 * cuenta es la que daría la corrida de verdad.
 */
class OsmImporter
{
    /** Cerrojo de PostgreSQL (pg_advisory_xact_lock): una importación a la vez. */
    public const int LOCK_KEY = 58_000_001;

    /** Metros dentro de los que una ficha con nombre parecido es un posible duplicado. */
    private const int DUPLICATE_RADIUS = 30;

    public function import(OverpassResult $result, bool $dryRun = false): OsmImportReport
    {
        $report = new OsmImportReport;
        $now = Carbon::now();

        // Por tipo e id: el orden de la respuesta no cambia los sufijos de los slugs.
        $elements = $result->elements;
        usort($elements, fn (array $a, array $b): int => [self::sortKey($a['type'] ?? null), self::sortKey($a['id'] ?? null)]
            <=> [self::sortKey($b['type'] ?? null), self::sortKey($b['id'] ?? null)]);

        DB::beginTransaction();

        try {
            $this->refuseIfUnsafe($elements);

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
                $this->importPlace($place, $categories[$place->category()], $now, $report, $result->withinBoundary);
            }

            if ($result->withinBoundary) {
                $this->markMissing($seen, $now, $report);
            }

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

    /**
     * Otra importación a la vez, o una respuesta vacía cuando ya hay fichas
     * importadas (marcaría todas como idas): no se escribe nada.
     *
     * @param  list<array<mixed>>  $elements
     */
    private function refuseIfUnsafe(array $elements): void
    {
        $locked = DB::selectOne('select pg_try_advisory_xact_lock(?) as locked', [self::LOCK_KEY]);

        if (! is_object($locked) || ($locked->locked ?? false) !== true) {
            throw new OsmImportRefused('Ya hay otra importación corriendo; esperá a que termine.');
        }

        $imported = RestaurantSource::query()->where('source', RestaurantSource::OPENSTREETMAP)->count();

        if ($elements === [] && $imported > 0) {
            throw new OsmImportRefused("Overpass no devolvió ningún local y ya hay {$imported} fichas importadas.");
        }
    }

    private static function sortKey(mixed $value): int|string
    {
        return is_int($value) || is_string($value) ? $value : '';
    }

    private function importPlace(OsmPlace $place, Category $category, Carbon $now, OsmImportReport $report, bool $withinBoundary): void
    {
        if ($place->name === null) {
            // Sin nombre no hay procedencia: desde el recuadro puede ser de un vecino.
            if ($withinBoundary) {
                $report->unnamed[] = $place;
            } else {
                $report->notCreated++;
            }

            return;
        }

        $source = RestaurantSource::query()
            ->where('source', RestaurantSource::OPENSTREETMAP)
            ->where('element_type', $place->type)
            ->where('element_id', $place->id)
            ->first();

        $hash = self::fingerprint($place->name, $place->point, [$category->slug]);

        if ($source === null) {
            if (! $withinBoundary) {
                $report->notCreated++;

                return;
            }

            $this->create($place, $category, $hash, $now, $report);
            $report->created++;

            return;
        }

        // Bloqueada hasta el final de la transacción: una edición a la vez
        // espera, y una que ya se guardó se ve aquí y suelta la ficha.
        $restaurant = Restaurant::query()
            ->with('categories:id,slug')
            ->whereKey($source->restaurant_id)
            ->lockForUpdate()
            ->firstOrFail();
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

    private function create(OsmPlace $place, Category $category, string $hash, Carbon $now, OsmImportReport $report): void
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

        $this->reportDuplicates($restaurant, $report);
    }

    /**
     * Las fichas a menos de 30 m con un nombre parecido van al informe como
     * posibles duplicados; decidir si lo son queda para el recorrido.
     */
    private function reportDuplicates(Restaurant $restaurant, OsmImportReport $report): void
    {
        $nearby = Restaurant::query()
            ->select(['id', 'name', 'slug'])
            ->whereKeyNot($restaurant->id)
            ->whereRaw('ST_DWithin(location, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)', [
                $restaurant->location->longitude,
                $restaurant->location->latitude,
                self::DUPLICATE_RADIUS,
            ])
            ->orderBy('id')
            ->get();

        foreach ($nearby as $other) {
            if (self::similarNames($restaurant->name, $other->name)) {
                $report->duplicates[] = [$restaurant->slug, $restaurant->name, $other->slug, $other->name];
            }
        }
    }

    /** Iguales sin tildes ni mayúsculas, uno dentro del otro o casi iguales. */
    private static function similarNames(string $a, string $b): bool
    {
        $a = Str::slug($a);
        $b = Str::slug($b);

        if ($a === '' || $b === '') {
            return false;
        }

        if (str_contains($a, $b) || str_contains($b, $a)) {
            return true;
        }

        similar_text($a, $b, $percent);

        return $percent >= 80;
    }

    /**
     * La ficha sigue como la dejó la importación: nadie la descartó, la
     * publicó, la verificó, la tocó su dueño ni le cambió nombre, punto o
     * categorías.
     */
    private function untouched(Restaurant $restaurant, RestaurantSource $source): bool
    {
        if ($source->dismissed_at !== null
            || $restaurant->status !== RestaurantStatus::Hidden
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
     * corrida y los que ya faltaban). Los descartados no.
     *
     * @param  array<string, array<int, true>>  $seen
     */
    private function markMissing(array $seen, Carbon $now, OsmImportReport $report): void
    {
        $sources = RestaurantSource::query()
            ->with('restaurant:id,name,slug,status')
            ->where('source', RestaurantSource::OPENSTREETMAP)
            ->whereNull('dismissed_at')
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

    /** Slug del nombre; si ya existe, con -2, -3… (RestaurantSlug). */
    private function uniqueSlug(string $name): string
    {
        return RestaurantSlug::unique($name);
    }
}
