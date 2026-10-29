<?php

use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Scout\EngineManager;
use Meilisearch\Client;

/*
| Integración con el Meilisearch de verdad (#17, ADR 0029): que los ajustes
| del índice hagan lo que dice config/scout.php. Usa el servicio del compose
| si responde (MEILISEARCH_HOST), en un índice propio con prefijo que se
| borra al terminar; si no responde (en CI no hay), se salta. Correrla sola:
|
|     php artisan test --group=meilisearch
*/

uses(RefreshDatabase::class)->group('meilisearch');

beforeEach(function () {
    $prefix = 'prueba_'.bin2hex(random_bytes(4)).'_';
    config(['scout.driver' => 'meilisearch', 'scout.queue' => false, 'scout.prefix' => $prefix]);
    app()->forgetInstance(Client::class);
    app()->forgetInstance(EngineManager::class);

    try {
        app(Client::class)->health();
    } catch (Throwable) {
        $this->markTestSkipped('Meilisearch no responde en '.var_export(config('scout.meilisearch.host'), true).'.');
    }

    $this->index = $prefix.'dishes';
});

afterEach(function () {
    if (isset($this->index)) {
        try {
            app(Client::class)->deleteIndex($this->index);
        } catch (Throwable) {
            // Si no llegó a crearse, no hay nada que borrar.
        }
    }
});

/** Espera a que Meilisearch termine de aplicar ajustes y documentos (los procesa en orden). */
function waitForDishIndex(string $index, int $documents): void
{
    $client = app(Client::class);

    for ($i = 0; $i < 100; $i++) {
        try {
            $stats = $client->index($index)->stats();

            if (($stats['numberOfDocuments'] ?? 0) === $documents && ($stats['isIndexing'] ?? false) === false) {
                return;
            }
        } catch (Throwable) {
            // Todavía no existe.
        }

        usleep(100_000);
    }

    throw new RuntimeException("El índice {$index} no llegó a {$documents} documentos.");
}

test('ignora tildes, perdona un error de tipeo y usa los sinónimos', function () {
    $restaurant = Restaurant::factory()->create(['name' => 'La Ceiba (ficticio)']);
    panelDish($restaurant, ['name_es' => 'Ajíaco santafereño', 'description_es' => 'Con pollo, mazorca y guascas.']);
    panelDish($restaurant, ['name_es' => 'Bandeja paisa', 'description_es' => 'Fríjoles, arroz, chicharrón y huevo.']);
    panelDish($restaurant, ['name_es' => 'Gaseosa', 'description_es' => null]);
    panelDish(Restaurant::factory()->hidden()->create(), ['name_es' => 'Ajiaco escondido']);

    $this->artisan('veni:search-sync')->assertSuccessful();
    waitForDishIndex($this->index, 3);

    $names = fn (string $query): array => collect($this->getJson('/api/dishes/search?q='.rawurlencode($query))->assertOk()->json('results'))
        ->flatMap(fn (array $group): array => array_column($group['dishes'], 'name'))
        ->all();

    expect($names('ajiaco'))->toBe(['Ajíaco santafereño'])
        ->and($names('ajíaco'))->toBe(['Ajíaco santafereño'])
        ->and($names('ajaico'))->toBe(['Ajíaco santafereño'])
        ->and($names('bandeja paiza'))->toBe(['Bandeja paisa'])
        ->and($names('refresco'))->toBe(['Gaseosa'])
        ->and($names('chicharron'))->toBe(['Bandeja paisa']);
});

test('veni:search-sync saca del índice los platos de una ficha que se ocultó sin el worker', function () {
    $restaurant = Restaurant::factory()->create();
    panelDish($restaurant, ['name_es' => 'Sancocho']);

    $this->artisan('veni:search-sync')->assertSuccessful();
    waitForDishIndex($this->index, 1);

    // Como si la cola no hubiera corrido: el estado cambia sin eventos.
    Restaurant::withoutEvents(fn () => $restaurant->forceFill(['status' => 'hidden'])->save());

    $this->artisan('veni:search-sync')->expectsOutputToContain('Platos que sobraban en el índice: 1.')->assertSuccessful();
    waitForDishIndex($this->index, 0);
});
