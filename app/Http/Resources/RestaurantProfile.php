<?php

namespace App\Http\Resources;

use App\Enums\Locale;
use App\Enums\PaymentMethod;
use App\Enums\RestaurantStatus;
use App\Http\Resources\Concerns\PresentsSchedule;
use App\Models\Category;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Restaurant;
use App\Models\SpecialHour;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * La ficha de un restaurante (#13): la prop `restaurant` de la página
 * Restaurants/Show.
 *
 * Es una lista blanca, como RestaurantFeature: lo que no está escrito aquí no
 * llega al navegador. No lleva el id de la base, a los dueños, el plan, la
 * ubicación exacta ni lo que el dueño todavía no publica (los platos no
 * disponibles). El contacto sí: es el del negocio, y la ficha es donde se
 * muestra.
 *
 * Tampoco lleva si está abierto: lleva el horario, igual que el mapa, y el
 * dispositivo lo calcula con el mismo módulo (ADR 0017).
 *
 * Espera las relaciones ya cargadas y en orden (categories, openingHours,
 * specialHours, menuSections con sus dishes y deliveryZones con su
 * neighborhood): las carga RestaurantController en una consulta por tabla.
 * De cada plato necesita `available`: con él decide si sale.
 *
 * @phpstan-import-type WeeklyHours from PresentsSchedule
 *
 * @phpstan-type ProfileCategory array{slug: string, name: string}
 * @phpstan-type ProfileSpecialHours array{date: string, closed: bool, opens: string|null, closes: string|null, note: string|null}
 * @phpstan-type ProfileZone array{neighborhood: string, fee: int}
 * @phpstan-type ProfileDish array{name: string, description: string|null, price: int, sold_out_until: string|null}
 * @phpstan-type ProfileSection array{name: string, dishes: list<ProfileDish>}
 * @phpstan-type Profile array{
 *     slug: string,
 *     name: string,
 *     description: string|null,
 *     categories: list<ProfileCategory>,
 *     fictitious: bool,
 *     hidden: bool,
 *     unverified: bool,
 *     updated_on: string|null,
 *     price_level: int|null,
 *     address: string|null,
 *     reference: string|null,
 *     phone: string|null,
 *     whatsapp: string|null,
 *     payment_methods: list<string>,
 *     delivery: array{available: bool, notes: string|null, zones: list<ProfileZone>},
 *     hours: list<WeeklyHours>,
 *     special_hours: list<ProfileSpecialHours>,
 *     menu: list<ProfileSection>,
 * }
 */
class RestaurantProfile extends JsonResource
{
    use PresentsSchedule;

    public function __construct(
        private readonly Restaurant $restaurant,
        private readonly Locale $locale,
    ) {
        parent::__construct($restaurant);
    }

    /**
     * @return Profile
     */
    public function toArray(Request $request): array
    {
        $restaurant = $this->restaurant;
        $zones = $this->zones();

        return [
            'slug' => $restaurant->slug,
            'name' => $restaurant->name,
            'description' => $restaurant->translated('description', $this->locale),
            'categories' => array_values($restaurant->categories
                ->map(fn (Category $category): array => [
                    'slug' => $category->slug,
                    'name' => (string) $category->translated('name', $this->locale),
                ])
                ->all()),
            'fictitious' => $restaurant->is_fictitious,
            // Solo llega a ser true para quien puede verla (RestaurantPolicy::view).
            'hidden' => $restaurant->status === RestaurantStatus::Hidden,
            // Sin reclamar: nadie del restaurante confirmó estos datos.
            'unverified' => $restaurant->status === RestaurantStatus::Unclaimed,
            'updated_on' => $restaurant->updated_at?->toDateString(),
            'price_level' => $restaurant->price_level,
            'address' => $restaurant->address,
            'reference' => $restaurant->reference,
            'phone' => $restaurant->phone,
            'whatsapp' => $restaurant->whatsapp,
            'payment_methods' => array_values($restaurant->payment_methods
                ->map(fn (PaymentMethod $method): string => $method->value)
                ->all()),
            'delivery' => [
                // Las zonas mandan sobre la casilla (ver Restaurant).
                'available' => $restaurant->delivery || $zones !== [],
                'notes' => $restaurant->translated('delivery_notes', $this->locale),
                'zones' => $zones,
            ],
            'hours' => self::weeklyHours($restaurant),
            'special_hours' => array_values($restaurant->specialHours
                ->map(fn (SpecialHour $day): array => [
                    'date' => $day->on_date->toDateString(),
                    'closed' => $day->closed,
                    'opens' => $day->opens_at === null ? null : self::time($day->opens_at),
                    'closes' => $day->closes_at === null ? null : self::time($day->closes_at),
                    'note' => $day->translated('note', $this->locale),
                ])
                ->all()),
            'menu' => $this->menu(),
        ];
    }

    /**
     * Barrios a los que lleva, por orden alfabético, con el costo en pesos.
     *
     * @return list<ProfileZone>
     */
    private function zones(): array
    {
        $zones = [];

        foreach ($this->restaurant->deliveryZones as $zone) {
            // Una zona no existe sin su barrio: la FK no deja borrarlo.
            if ($zone->neighborhood !== null) {
                $zones[] = ['neighborhood' => $zone->neighborhood->name, 'fee' => $zone->fee];
            }
        }

        return $zones;
    }

    /**
     * El menú por secciones, en el orden del restaurante. Una sección sin
     * platos que mostrar no sale: un título solo no le sirve a nadie.
     *
     * @return list<ProfileSection>
     */
    private function menu(): array
    {
        return array_values($this->restaurant->menuSections
            ->filter(fn (MenuSection $section): bool => $section->dishes->contains('available', true))
            ->map(fn (MenuSection $section): array => [
                'name' => (string) $section->translated('name', $this->locale),
                'dishes' => array_values($section->dishes
                    // Lo que el dueño sacó del menú no se publica, aunque
                    // llegue cargado.
                    ->filter(fn (Dish $dish): bool => $dish->available)
                    ->map(fn (Dish $dish): array => [
                        'name' => (string) $dish->translated('name', $this->locale),
                        'description' => $dish->translated('description', $this->locale),
                        'price' => $dish->price,
                        // «Agotado hoy» vale hasta esta fecha, incluida. Si
                        // hoy está agotado lo dice el dispositivo, como
                        // «abierto ahora»: la ficha puede quedar abierta de
                        // un día para otro.
                        'sold_out_until' => $dish->sold_out_until?->toDateString(),
                    ])
                    ->all()),
            ])
            ->all());
    }
}
