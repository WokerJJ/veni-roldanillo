<?php

namespace App\Console\Commands;

use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use App\Models\RestaurantSource;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Descarta una ficha importada de OpenStreetMap que en la calle no existe o
 * no se va a publicar (#58, ADR 0021): sigue oculta, y la importación ya no
 * la actualiza, no la lista para verificar ni la marca como ida.
 */
#[Signature('veni:osm-dismiss {slug : La ficha importada que se descarta}')]
#[Description('Descarta una ficha importada de OpenStreetMap: la importación ya no la toca ni la lista')]
class DismissOsmRestaurant extends Command
{
    public function handle(): int
    {
        /** @var string $slug */
        $slug = $this->argument('slug');

        $restaurant = Restaurant::query()->with('source')->where('slug', $slug)->first();

        if ($restaurant === null) {
            $this->components->error("No hay ninguna ficha con el slug {$slug}.");

            return self::FAILURE;
        }

        $source = $restaurant->source;

        if ($source === null || $source->source !== RestaurantSource::OPENSTREETMAP) {
            $this->components->error("{$slug} no viene de OpenStreetMap: no hay nada que descartar.");

            return self::FAILURE;
        }

        if ($restaurant->status !== RestaurantStatus::Hidden) {
            $this->components->error("{$slug} está publicada: ocultala antes de descartarla.");

            return self::FAILURE;
        }

        if ($source->dismissed_at === null) {
            $source->forceFill(['dismissed_at' => Carbon::now()])->save();
        }

        $this->components->info("Descartada: {$restaurant->name} ({$slug}). Sigue oculta y la importación ya no la toca.");

        return self::SUCCESS;
    }
}
