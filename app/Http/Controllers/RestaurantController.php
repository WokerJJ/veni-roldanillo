<?php

namespace App\Http\Controllers;

use App\Enums\Locale;
use App\Http\Resources\RestaurantProfile;
use App\Models\Neighborhood;
use App\Models\Restaurant;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * La ficha pública de un restaurante (#13, ADR 0018): GET /restaurants/{slug}.
 *
 * Qué campos llegan al navegador lo decide RestaurantProfile; quién la ve,
 * RestaurantPolicy::view.
 */
class RestaurantController extends Controller
{
    /** Largo de la descripción del documento: lo que un buscador muestra sin cortar. */
    private const META_DESCRIPTION_LENGTH = 155;

    public function show(Request $request, string $slug): Response
    {
        $restaurant = Restaurant::query()
            ->select([
                'id', 'slug', 'name', 'description_es', 'description_en', 'address', 'reference',
                'phone', 'whatsapp', 'price_level', 'delivery', 'delivery_notes_es', 'delivery_notes_en',
                'payment_methods', 'status', 'is_fictitious', 'updated_at',
            ])
            ->where('slug', $slug)
            ->first();

        // Una ficha oculta responde lo mismo que una que no existe: un 403
        // le diría a cualquiera que ese restaurante está en la base.
        if ($restaurant === null || Gate::denies('view', $restaurant)) {
            abort(404);
        }

        // Siete consultas más, tenga el menú tres platos o trescientos: una
        // por tabla. Es lo que hace $restaurant->load(), con las categorías y
        // el horario cargados igual que en el mapa (ver Restaurant).
        Restaurant::query()
            ->withPublicCategories()
            ->withPublicSchedule()
            ->with([
                // Secciones y platos ya salen en el orden del restaurante (position, id).
                'menuSections' => function (Relation $sections): void {
                    $sections->select(['id', 'restaurant_id', 'name_es', 'name_en', 'position']);
                },
                // Lo que el dueño sacó del menú no hace falta traerlo:
                // RestaurantProfile no lo publica (lo decide con available).
                'menuSections.dishes' => function (Relation $dishes): void {
                    $dishes
                        ->select([
                            'id', 'restaurant_id', 'menu_section_id', 'name_es', 'name_en',
                            'description_es', 'description_en', 'price', 'available', 'sold_out_until', 'position',
                        ])
                        ->where('available', true);
                },
                // Las zonas de domicilio con su costo, por orden alfabético del
                // barrio (lo ordena la base, que sabe de tildes), y sus nombres.
                'deliveryZones' => function (Relation $zones): void {
                    $zones
                        ->select(['id', 'restaurant_id', 'neighborhood_id', 'fee'])
                        ->orderBy(Neighborhood::query()->select('name')->whereColumn('neighborhoods.id', 'delivery_zones.neighborhood_id'))
                        ->orderBy('id');
                },
                'deliveryZones.neighborhood' => function (Relation $neighborhoods): void {
                    $neighborhoods->select(['id', 'name']);
                },
            ])
            ->eagerLoadRelations([$restaurant]);

        $locale = Locale::current();

        return Inertia::render('Restaurants/Show', [
            'restaurant' => (new RestaurantProfile($restaurant, $locale))->toArray($request),
            // El título y la descripción del documento: la vista raíz los
            // escribe en el HTML (resources/views/app.blade.php) y la página
            // los mantiene al navegar sin recargar.
            'meta' => [
                'title' => $restaurant->name,
                'description' => $this->metaDescription($restaurant, $locale),
            ],
        ]);
    }

    /**
     * La descripción del restaurante en el idioma de la petición, recortada
     * sin partir palabras; si no tiene, una frase con su nombre.
     */
    private function metaDescription(Restaurant $restaurant, Locale $locale): string
    {
        $description = $restaurant->translated('description', $locale);

        if ($description === null) {
            return __('restaurant.meta_description', ['name' => $restaurant->name]);
        }

        return Str::limit(Str::squish($description), self::META_DESCRIPTION_LENGTH, '…', preserveWords: true);
    }
}
