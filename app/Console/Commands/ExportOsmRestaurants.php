<?php

namespace App\Console\Commands;

use App\Models\Restaurant;
use App\Models\RestaurantSource;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * Escribe en GeoJSON la parte de la base que viene de OpenStreetMap, para
 * entregarla bajo ODbL a quien la pida (#58, ADR 0021, /credits): nombre,
 * tipo de local, punto, identificador del objeto y procedencia. Nada más.
 */
#[Signature('veni:osm-export')]
#[Description('Exporta en GeoJSON, bajo ODbL, los locales que vienen de OpenStreetMap')]
class ExportOsmRestaurants extends Command
{
    public function handle(): int
    {
        $sources = RestaurantSource::query()
            ->with('restaurant:id,name,location')
            ->where('source', RestaurantSource::OPENSTREETMAP)
            ->orderBy('element_type')
            ->orderBy('element_id')
            ->get();

        $features = [];

        foreach ($sources as $source) {
            /** @var Restaurant $restaurant */
            $restaurant = $source->restaurant;

            $features[] = [
                'type' => 'Feature',
                'geometry' => ['type' => 'Point', 'coordinates' => [$restaurant->location->longitude, $restaurant->location->latitude]],
                'properties' => [
                    'name' => $restaurant->name,
                    'kind' => $source->element_kind,
                    'osm_type' => $source->element_type,
                    'osm_id' => $source->element_id,
                    'osm_url' => $source->url(),
                    'source' => $source->source,
                ],
            ];
        }

        $export = [
            'type' => 'FeatureCollection',
            'license' => 'ODbL-1.0',
            'license_url' => 'https://opendatacommons.org/licenses/odbl/1-0/',
            'attribution' => '© colaboradores de OpenStreetMap, https://www.openstreetmap.org/copyright',
            'generated_at' => Carbon::now()->toIso8601String(),
            'features' => $features,
        ];

        $path = 'osm/export/openstreetmap-'.Carbon::now()->format('Y-m-d').'.geojson';
        Storage::disk('local')->put($path, json_encode($export, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");

        // Con line(): el formato de components->info() se come las barras de la ruta.
        $this->line(count($features).' locales de OpenStreetMap, bajo ODbL: '.Storage::disk('local')->path($path));

        return self::SUCCESS;
    }
}
