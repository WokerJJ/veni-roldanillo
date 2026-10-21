<?php

namespace App\Console\Commands;

use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Publica una ficha oculta, mientras no haya panel de administración (#19).
 * Exige que esté verificada en la calle, o que quien la publica lo registre
 * con --verified (ADR 0021). Queda reclamada si ya tiene dueño y, si no, sin
 * reclamar: los dos estados que publica RestaurantStatus.
 */
#[Signature('veni:publish
    {slug : La ficha oculta que se publica}
    {--verified : Registra que la verificaste en la calle, con la fecha de ahora}')]
#[Description('Publica una ficha oculta ya verificada en la calle')]
class PublishRestaurant extends Command
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

        if ($restaurant->status->isPublished()) {
            $this->components->error("{$slug} ya está publicada.");

            return self::FAILURE;
        }

        if ($restaurant->source?->dismissed_at !== null) {
            $this->components->error("{$slug} está descartada (veni:osm-dismiss): no se publica.");

            return self::FAILURE;
        }

        $verify = (bool) $this->option('verified');

        if ($restaurant->verified_at === null && ! $verify) {
            $this->components->error("{$slug} no está verificada. Si la verificaste en la calle, corré `php artisan veni:publish {$slug} --verified`: queda registrado con la fecha de ahora.");

            return self::FAILURE;
        }

        $status = $restaurant->owners()->exists() ? RestaurantStatus::Claimed : RestaurantStatus::Unclaimed;

        $restaurant->forceFill([
            'status' => $status,
            'verified_at' => $restaurant->verified_at ?? Carbon::now(),
        ])->save();

        $this->components->info("Publicada: {$restaurant->name} ({$slug}), {$status->value}.");

        return self::SUCCESS;
    }
}
