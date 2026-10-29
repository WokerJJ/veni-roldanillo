<?php

use App\Models\Dish;

/*
| Laravel Scout + Meilisearch: la búsqueda por plato (#17, ADR 0029).
|
| Solo se indexan los platos de los restaurantes publicados (Dish::
| shouldBeSearchable). La clave de Meilisearch vive solo en el servidor: el
| navegador le pregunta a GET /api/dishes/search, nunca a Meilisearch.
|
| Se dejaron solo las opciones que usa este proyecto; el archivo completo
| está en vendor/laravel/scout/config/scout.php.
*/

return [

    // meilisearch en el compose; collection en las pruebas (phpunit.xml),
    // que busca en la base sin servicio aparte.
    'driver' => env('SCOUT_DRIVER', 'collection'),

    'prefix' => env('SCOUT_PREFIX', ''),

    // Por la cola (el worker del compose), y después de que la transacción
    // del panel se confirma: el trabajo lee lo que quedó guardado (ADR 0029).
    'queue' => env('SCOUT_QUEUE', true),

    'after_commit' => true,

    'chunk' => [
        'searchable' => 500,
        'unsearchable' => 500,
    ],

    'soft_delete' => false,

    'identify' => false,

    'meilisearch' => [
        'host' => env('MEILISEARCH_HOST', 'http://localhost:7700'),
        'key' => env('MEILISEARCH_KEY'),

        // Lo que más espera el servidor a Meilisearch (AppServiceProvider):
        // pasado, la búsqueda por plato responde 503 y la del dispositivo
        // sigue andando.
        'timeout' => (float) env('MEILISEARCH_TIMEOUT', 2),
        'connect_timeout' => (float) env('MEILISEARCH_CONNECT_TIMEOUT', 1),

        // php artisan veni:search-sync los aplica (y reindexa).
        'index-settings' => [
            Dish::class => [
                // En orden de importancia: un plato que se llama «Sancocho»
                // va antes que uno que lo nombra en la descripción.
                'searchableAttributes' => [
                    'name_es', 'name_en',
                    'section_es', 'section_en',
                    'description_es', 'description_en',
                    'categories',
                    'restaurant_name',
                ],
                'filterableAttributes' => ['restaurant_slug', 'category_slugs', 'price', 'available'],
                'sortableAttributes' => ['price'],
                // Meilisearch ya ignora tildes y mayúsculas («ajíaco» =
                // «ajiaco»). Con los nombres cortos de los platos, una letra
                // equivocada desde 4 letras y dos desde 8.
                'typoTolerance' => [
                    'enabled' => true,
                    'minWordSizeForTypos' => ['oneTypo' => 4, 'twoTypos' => 8],
                ],
                // Sinónimos de la región: cómo le dice cada quien a lo mismo.
                'synonyms' => [
                    'gaseosa' => ['refresco', 'soda'],
                    'refresco' => ['gaseosa'],
                    'jugo' => ['zumo'],
                    'perro' => ['perro caliente', 'hot dog'],
                    'hot dog' => ['perro caliente'],
                    'hamburguesa' => ['burger'],
                    'burger' => ['hamburguesa'],
                    'tinto' => ['café'],
                    'corrientazo' => ['almuerzo', 'ejecutivo'],
                    'ejecutivo' => ['corrientazo'],
                    'salchipapa' => ['salchipapas'],
                    'arepa' => ['arepas'],
                ],
                'pagination' => ['maxTotalHits' => 200],
            ],
        ],
    ],

];
