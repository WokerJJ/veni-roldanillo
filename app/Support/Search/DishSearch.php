<?php

namespace App\Support\Search;

use App\Enums\Locale;
use App\Models\Dish;
use App\Models\Restaurant;
use Illuminate\Database\Eloquent\Builder;
use Meilisearch\Exceptions\ExceptionInterface as MeilisearchException;
use Psr\Http\Client\ClientExceptionInterface;

/**
 * La búsqueda por plato (#17, ADR 0029): Meilisearch encuentra los platos y
 * la base los confirma y los agrupa por restaurante.
 *
 * Los platos salen de la base, no del índice: si el índice quedó atrasado
 * (la cola todavía no corrió), un plato borrado o de una ficha que se acaba
 * de ocultar no aparece, y el precio y «agotado hoy» son los de ahora.
 */
final class DishSearch
{
    /**
     * Cuántos platos se le piden a Meilisearch, en orden de relevancia: el
     * maxTotalHits del índice (config/scout.php). Con menos, un restaurante
     * con muchos platos que coinciden deja afuera a los demás, y la respuesta
     * se corta igual en MAX_RESTAURANTS × MAX_DISHES_PER_RESTAURANT.
     */
    public const MAX_HITS = 200;

    /** Cuántos restaurantes, como mucho, tiene una respuesta. */
    public const MAX_RESTAURANTS = 10;

    /** Cuántos platos de un mismo restaurante. */
    public const MAX_DISHES_PER_RESTAURANT = 5;

    /**
     * Los restaurantes con sus platos que responden a `$query`, del que tiene
     * el plato más relevante al que menos; dentro de cada uno, los platos en
     * ese mismo orden. Lista blanca: nada del dueño ni del índice.
     *
     * @return list<array{restaurant: array{slug: string, name: string, url: string}, dishes: list<array{id: int, name: string, description: string|null, section: string|null, price: int, available: bool}>}>
     *
     * @throws SearchUnavailable si Meilisearch no responde o responde con un error.
     */
    public function search(string $query, Locale $locale): array
    {
        try {
            $dishes = Dish::search($query)
                ->take(self::MAX_HITS)
                ->query(function (Builder $dishes): void {
                    /** @var Builder<Dish> $dishes */
                    $dishes
                        ->select(['id', 'restaurant_id', 'menu_section_id', 'name_es', 'name_en', 'description_es', 'description_en', 'price', 'available', 'sold_out_until'])
                        ->indexable()
                        ->with(['restaurant:id,slug,name', 'menuSection:id,name_es,name_en']);
                })
                ->get();
        } catch (MeilisearchException|ClientExceptionInterface $exception) {
            throw new SearchUnavailable($exception);
        }

        /** @var array<int, array{restaurant: array{slug: string, name: string, url: string}, dishes: list<array{id: int, name: string, description: string|null, section: string|null, price: int, available: bool}>}> $groups */
        $groups = [];

        foreach ($dishes as $dish) {
            $restaurant = $dish->restaurant;

            if (! $restaurant instanceof Restaurant) {
                continue;
            }

            if (! isset($groups[$restaurant->id])) {
                if (count($groups) === self::MAX_RESTAURANTS) {
                    continue;
                }

                $groups[$restaurant->id] = [
                    'restaurant' => [
                        'slug' => $restaurant->slug,
                        'name' => $restaurant->name,
                        'url' => route('restaurants.show', $restaurant->slug, absolute: false),
                    ],
                    'dishes' => [],
                ];
            }

            if (count($groups[$restaurant->id]['dishes']) === self::MAX_DISHES_PER_RESTAURANT) {
                continue;
            }

            $groups[$restaurant->id]['dishes'][] = [
                'id' => $dish->id,
                'name' => (string) $dish->translated('name', $locale),
                'description' => $dish->translated('description', $locale),
                'section' => $dish->menuSection?->translated('name', $locale),
                'price' => $dish->price,
                'available' => $dish->orderableToday(),
            ];
        }

        return array_values($groups);
    }
}
