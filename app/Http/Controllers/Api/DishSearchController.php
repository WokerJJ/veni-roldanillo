<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\DishSearchRequest;
use App\Support\Search\DishSearch;
use App\Support\Search\SearchUnavailable;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

/**
 * GET /api/dishes/search?q=sancocho&lang=es (#17, ADR 0029): los platos que
 * responden a la consulta, agrupados por restaurante.
 *
 * Público y sin sesión (routes/api.php). El navegador le pregunta a este
 * endpoint, nunca a Meilisearch: la clave no sale del servidor. La consulta no
 * se guarda (ni en el registro cuando Meilisearch falla).
 *
 * Bien: 200 y una caché pública de un minuto (lo que tarda en verse un plato
 * editado, como la capa del mapa). Meilisearch caído o lento: 503 sin caché,
 * con Retry-After; el buscador del inicio sigue buscando restaurantes en el
 * dispositivo.
 */
class DishSearchController extends Controller
{
    /** Segundos que el navegador guarda una respuesta. */
    public const MAX_AGE = 60;

    /** Segundos tras los que conviene volver a probar si Meilisearch no respondió. */
    public const RETRY_AFTER = 30;

    public function __invoke(DishSearchRequest $request, DishSearch $search): JsonResponse
    {
        try {
            $results = $search->search($request->searchQuery(), $request->locale());
        } catch (SearchUnavailable $unavailable) {
            Log::warning('Búsqueda por plato sin Meilisearch.', [
                'error' => $unavailable->getPrevious() !== null ? $unavailable->getPrevious()::class : null,
            ]);

            return response()
                ->json(['error' => 'search_unavailable'], 503, ['Retry-After' => (string) self::RETRY_AFTER])
                ->header('Cache-Control', 'no-store');
        }

        return response()
            ->json(['results' => $results])
            ->setCache(['public' => true, 'max_age' => self::MAX_AGE]);
    }
}
