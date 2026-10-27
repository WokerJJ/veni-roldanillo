<?php

namespace App\Console\Commands;

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Restaurants\DismissOsmDraft;
use App\Models\Restaurant;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Descarta una ficha importada de OpenStreetMap que en la calle no existe o
 * no se va a publicar (#58, ADR 0021): sigue oculta, y la importación ya no
 * la actualiza, no la lista para verificar ni la marca como ida. El panel de
 * administración (#19) usa la misma acción (DismissOsmDraft, ADR 0027).
 */
#[Signature('veni:osm-dismiss {slug : La ficha importada que se descarta}')]
#[Description('Descarta una ficha importada de OpenStreetMap: la importación ya no la toca ni la lista')]
class DismissOsmRestaurant extends Command
{
    public function handle(DismissOsmDraft $dismiss): int
    {
        /** @var string $slug */
        $slug = $this->argument('slug');

        $restaurant = Restaurant::query()->where('slug', $slug)->first();

        if ($restaurant === null) {
            $this->components->error("No hay ninguna ficha con el slug {$slug}.");

            return self::FAILURE;
        }

        try {
            $dismiss->handle($restaurant);
        } catch (ActionRefused $refused) {
            $this->components->error($refused->reason === ActionRefused::NOT_FROM_OSM
                ? "{$slug} no viene de OpenStreetMap: no hay nada que descartar."
                : "{$slug} está publicada: ocultala antes de descartarla.");

            return self::FAILURE;
        }

        $this->components->info("Descartada: {$restaurant->name} ({$slug}). Sigue oculta y la importación ya no la toca.");

        return self::SUCCESS;
    }
}
