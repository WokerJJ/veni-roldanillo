<?php

namespace App\Console\Commands;

use App\Models\Dish;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Meilisearch\Client;
use Meilisearch\Contracts\DocumentsQuery;
use Meilisearch\Exceptions\ApiException;

/**
 * Deja el índice de platos (#17, ADR 0029) igual a la base: aplica los
 * ajustes de config/scout.php (crea el índice si no existe), sube los platos
 * de los restaurantes publicados y saca los que sobran (de fichas ocultas o
 * platos borrados mientras el worker no corría). Se puede correr las veces que
 * haga falta: nunca vacía el índice, así la búsqueda sigue andando mientras
 * tanto.
 *
 * Corre sin la cola: termina con todo enviado a Meilisearch, que lo aplica en
 * orden en unos segundos.
 */
#[Signature('veni:search-sync')]
#[Description('Crea o ajusta el índice de platos de Meilisearch y lo pone al día con la base')]
class SyncDishSearch extends Command
{
    /** Platos por página al recorrer el índice. */
    private const PAGE = 1000;

    public function handle(): int
    {
        $meilisearch = config('scout.driver') === 'meilisearch';

        if ($meilisearch) {
            $this->call('scout:sync-index-settings');
        } else {
            $this->components->warn('SCOUT_DRIVER no es meilisearch: no hay índice que ajustar; solo se recorren los platos.');
        }

        config(['scout.queue' => false]);

        $published = Dish::query()->ofPublishedRestaurants()->with(Dish::SEARCH_RELATIONS);

        $count = $published->count();
        $published->chunkById(500, fn (Collection $dishes) => Dish::syncWithSearch($dishes, true));
        $this->components->info("Platos enviados al índice: {$count}.");

        if ($meilisearch) {
            $removed = $this->removeStale();
            $this->components->info("Platos que sobraban en el índice: {$removed}.");
        }

        return self::SUCCESS;
    }

    /** Saca del índice los platos que la base ya no publica. */
    private function removeStale(): int
    {
        $index = app(Client::class)->index((new Dish)->searchableAs());

        /** @var array<int, true> $keep */
        $keep = array_fill_keys(
            Dish::query()->ofPublishedRestaurants()->pluck('id')->filter(fn (mixed $id): bool => is_int($id))->all(),
            true,
        );

        $stale = [];

        for ($offset = 0; ; $offset += self::PAGE) {
            try {
                $page = $index->getDocuments((new DocumentsQuery)->setFields(['id'])->setLimit(self::PAGE)->setOffset($offset));
            } catch (ApiException $missing) {
                // La primera vez el índice se crea en segundo plano: no hay nada que sobre.
                if ($missing->httpStatus === 404) {
                    return 0;
                }

                throw $missing;
            }

            foreach ($page->getResults() as $document) {
                $id = is_numeric($document['id'] ?? null) ? (int) $document['id'] : null;

                if ($id !== null && ! isset($keep[$id])) {
                    $stale[] = $id;
                }
            }

            if ($offset + self::PAGE >= $page->getTotal()) {
                break;
            }
        }

        if ($stale !== []) {
            $index->deleteDocuments($stale);
        }

        return count($stale);
    }
}
