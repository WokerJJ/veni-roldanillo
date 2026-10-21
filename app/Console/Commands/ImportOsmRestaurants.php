<?php

namespace App\Console\Commands;

use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use App\Models\RestaurantSource;
use App\Support\Osm\OsmImporter;
use App\Support\Osm\OsmImportRefused;
use App\Support\Osm\OsmImportReport;
use App\Support\Osm\OsmPlace;
use App\Support\Osm\OverpassClient;
use App\Support\Osm\OverpassRateLimited;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Importa los locales de comida de OpenStreetMap como fichas ocultas (#58,
 * ADR 0021) y escribe el listado para verificarlos en la calle.
 */
#[Signature('veni:osm-import {--dry-run : Cuenta lo que haría sin escribir nada}')]
#[Description('Importa los locales de comida de OpenStreetMap como fichas ocultas')]
class ImportOsmRestaurants extends Command
{
    public function handle(OverpassClient $overpass, OsmImporter $importer): int
    {
        $dryRun = (bool) $this->option('dry-run');

        try {
            $result = $overpass->fetch();
        } catch (OverpassRateLimited) {
            $this->components->error('Overpass pidió esperar (429). Volvé a correrlo más tarde.');

            return self::FAILURE;
        } catch (RuntimeException|ConnectionException $error) {
            $this->components->error("Overpass no respondió: {$error->getMessage()} No se importó nada.");

            return self::FAILURE;
        }

        $this->components->info(sprintf(
            'Overpass (%s): %d elementos.%s',
            $result->withinBoundary ? 'límite de Roldanillo' : 'recuadro del límite, respaldo',
            count($result->elements),
            $dryRun ? ' Prueba sin escribir (--dry-run).' : '',
        ));

        try {
            $report = $importer->import($result, $dryRun);
        } catch (OsmImportRefused $refused) {
            $this->components->error("{$refused->getMessage()} No se importó nada.");

            return self::FAILURE;
        }

        if (! $result->withinBoundary) {
            $this->components->warn("Respaldo por recuadro, que también cubre parte de los municipios vecinos: {$report->notCreated} locales nuevos sin crear y nada marcado como ido. Volvé a correrlo cuando responda la consulta por el límite.");
        }

        $this->table(['', 'Fichas'], [
            ['Creadas (ocultas)', $report->created],
            ['Actualizadas', $report->updated],
            ['Sin cambios', $report->unchanged],
            ['Omitidas: editadas, verificadas, publicadas o descartadas', count($report->skipped)],
            ['Omitidas: sin nombre', count($report->unnamed)],
            ['Ya no están en OpenStreetMap', count($report->missing)],
        ]);

        foreach ($report->missing as $source) {
            $this->line("  Ya no está: {$source->restaurant?->name} ({$source->url()})");
        }

        foreach ($report->duplicates as [$newSlug, , $oldSlug]) {
            $this->line("  Posible duplicado: {$newSlug} y {$oldSlug}");
        }

        if (! $dryRun) {
            $path = $this->writeChecklist($report);
            // Con line(): el formato de components->info() se come las barras de la ruta.
            $this->line('Listado para el recorrido: '.Storage::disk('local')->path($path));
        }

        return self::SUCCESS;
    }

    /**
     * El listado para el recorrido, en Markdown: las fichas importadas que
     * siguen ocultas y falta verificar (con cómo publicarlas o descartarlas),
     * los posibles duplicados, los locales sin nombre y los que ya no están.
     */
    private function writeChecklist(OsmImportReport $report): string
    {
        $pending = Restaurant::query()
            ->select(['restaurants.id', 'restaurants.name', 'restaurants.slug'])
            ->with('source')
            ->whereHas('source', fn ($sources) => $sources
                ->where('source', RestaurantSource::OPENSTREETMAP)
                ->whereNull('missing_since')
                ->whereNull('dismissed_at'))
            ->where('status', RestaurantStatus::Hidden)
            ->whereNull('verified_at')
            ->orderBy('name')
            ->get();

        $lines = [
            '# Recorrido: locales de OpenStreetMap por verificar',
            '',
            'Generado el '.Carbon::now()->format('Y-m-d H:i').' con `php artisan veni:osm-import`.',
            'Datos © colaboradores de OpenStreetMap, bajo ODbL. Solo nombre, tipo y punto.',
            '',
            "## Fichas ocultas por verificar ({$pending->count()})",
            '',
        ];

        foreach ($pending as $restaurant) {
            /** @var RestaurantSource $source */
            $source = $restaurant->source;
            $lines[] = "- [ ] **{$restaurant->name}** · ".OsmPlace::label($source->element_kind)." · [punto en OpenStreetMap]({$source->url()}) · `{$restaurant->slug}`";
            $lines[] = '  - [ ] Existe y está abierto';
            $lines[] = '  - [ ] El nombre está bien';
            $lines[] = '  - [ ] El punto está bien';
            $lines[] = '  - [ ] La categoría está bien';
            $lines[] = "  - Verificada: `php artisan veni:publish {$restaurant->slug} --verified` · Si no existe: `php artisan veni:osm-dismiss {$restaurant->slug}`";
        }

        $lines = [...$lines, '', '## Posibles duplicados ('.count($report->duplicates).')', ''];

        foreach ($report->duplicates as [$newSlug, $newName, $oldSlug, $oldName]) {
            $lines[] = "- [ ] `{$newSlug}` ({$newName}) y `{$oldSlug}` ({$oldName}), a menos de 30 m";
        }

        $lines = [...$lines, '', '## Sin nombre en OpenStreetMap ('.count($report->unnamed).')', ''];

        foreach ($report->unnamed as $place) {
            $lines[] = '- [ ] '.OsmPlace::label($place->kind)." sin nombre · [punto en OpenStreetMap]({$place->url()})";
        }

        $lines = [...$lines, '', '## Ya no están en OpenStreetMap ('.count($report->missing).')', ''];

        foreach ($report->missing as $source) {
            $lines[] = "- [ ] **{$source->restaurant?->name}** · ¿cerró? · [objeto en OpenStreetMap]({$source->url()})";
        }

        $path = 'osm/recorrido-'.Carbon::now()->format('Y-m-d').'.md';
        Storage::disk('local')->put($path, implode("\n", $lines)."\n");

        return $path;
    }
}
