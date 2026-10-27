<?php

namespace App\Console\Commands;

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Restaurants\PublishRestaurant as Publish;
use App\Models\Restaurant;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Publica una ficha oculta desde la consola; el panel de administración
 * (#19) hace lo mismo con la misma acción (App\Actions\Restaurants\
 * PublishRestaurant, ADR 0021 y 0027). Exige que esté verificada en la
 * calle, o que quien la publica lo registre con --verified.
 */
#[Signature('veni:publish
    {slug : La ficha oculta que se publica}
    {--verified : Registra que la verificaste en la calle, con la fecha de ahora}')]
#[Description('Publica una ficha oculta ya verificada en la calle')]
class PublishRestaurant extends Command
{
    public function handle(Publish $publish): int
    {
        /** @var string $slug */
        $slug = $this->argument('slug');

        $restaurant = Restaurant::query()->where('slug', $slug)->first();

        if ($restaurant === null) {
            $this->components->error("No hay ninguna ficha con el slug {$slug}.");

            return self::FAILURE;
        }

        try {
            $status = $publish->handle($restaurant, verifiedNow: (bool) $this->option('verified'));
        } catch (ActionRefused $refused) {
            $this->components->error(match ($refused->reason) {
                ActionRefused::ALREADY_PUBLISHED => "{$slug} ya está publicada.",
                ActionRefused::DISMISSED => "{$slug} está descartada (veni:osm-dismiss): no se publica.",
                default => "{$slug} no está verificada. Si la verificaste en la calle, corré `php artisan veni:publish {$slug} --verified`: queda registrado con la fecha de ahora.",
            });

            return self::FAILURE;
        }

        $this->components->info("Publicada: {$restaurant->name} ({$slug}), {$status->value}.");

        return self::SUCCESS;
    }
}
