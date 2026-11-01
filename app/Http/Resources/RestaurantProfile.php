<?php

namespace App\Http\Resources;

use App\Enums\Locale;
use App\Enums\OptionGroupKind;
use App\Enums\PaymentMethod;
use App\Enums\RestaurantStatus;
use App\Http\Resources\Concerns\PresentsSchedule;
use App\Models\Category;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Option;
use App\Models\Restaurant;
use App\Models\SpecialHour;
use App\Support\BusinessDay;
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
 * specialHours, menuSections con sus dishes, los optionGroups de cada plato
 * con sus options, y deliveryZones con su neighborhood): las carga
 * RestaurantController en una consulta por tabla. De cada plato y de cada
 * opción necesita `available`: con él decide si sale. De los ingredientes
 * (#112, ADR 0033), solo los agotados desde hoy, con su reemplazo y los
 * platos que los llevan (dishLinks).
 *
 * @phpstan-import-type WeeklyHours from PresentsSchedule
 *
 * @phpstan-type ProfileCategory array{slug: string, name: string}
 * @phpstan-type ProfileSpecialHours array{date: string, closed: bool, opens: string|null, closes: string|null, note: string|null}
 * @phpstan-type ProfileZone array{neighborhood: string, fee: int}
 * @phpstan-type ProfileOption array{name: string, price: int, ingredient: int|null}
 * @phpstan-type ProfileSubstitute array{name: string, price: int, sold_out_until: string|null}
 * @phpstan-type ProfileIngredient array{name: string, essential: bool, in_dish: bool, sold_out_until: string, substitute: ProfileSubstitute|null}
 * @phpstan-type ProfileOptionGroup array{name: string, kind: string, min: int, max: int, options: list<ProfileOption>}
 * @phpstan-type ProfileDish array{name: string, description: string|null, price: int, sold_out_until: string|null, ingredients: list<ProfileIngredient>, groups: list<ProfileOptionGroup>}
 * @phpstan-type ProfileSection array{name: string, dishes: list<ProfileDish>}
 * @phpstan-type Profile array{
 *     slug: string,
 *     name: string,
 *     description: string|null,
 *     categories: list<ProfileCategory>,
 *     fictitious: bool,
 *     hidden: bool,
 *     unverified: bool,
 *     claimable: bool,
 *     updated_on: string|null,
 *     owner_updated_on: string|null,
 *     delay_minutes: int|null,
 *     delay_until: string|null,
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
            // Muestra «Reclámalo»: la misma regla que acepta el formulario (#20).
            'claimable' => $restaurant->isClaimable(),
            'updated_on' => $restaurant->updated_at?->toDateString(),
            // «Actualizada el…»: el último cambio del dueño desde su panel (ADR 0025).
            'owner_updated_on' => $restaurant->updated_by_owner_at?->timezone(BusinessDay::TIME_ZONE)->toDateString(),
            // «Demora de N min», mientras el aviso del panel no venza.
            'delay_minutes' => $restaurant->activeDelayMinutes(),
            // Hasta cuándo vale (ISO-8601, hora de Colombia): el dispositivo lo quita
            // al vencer aunque la ficha siga abierta.
            'delay_until' => $restaurant->activeDelayMinutes() === null ? null : $restaurant->delay_until?->timezone(BusinessDay::TIME_ZONE)->toIso8601String(),
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
                    ->map(fn (Dish $dish): array => $this->dish($dish))
                    ->all()),
            ])
            ->all());
    }

    /**
     * Un plato de la ficha.
     *
     * @return ProfileDish
     */
    private function dish(Dish $dish): array
    {
        [$ingredients, $positions] = $this->ingredients($dish);

        return [
            'name' => (string) $dish->translated('name', $this->locale),
            'description' => $dish->translated('description', $this->locale),
            'price' => $dish->price,
            // «Agotado hoy» vale hasta esta fecha, incluida. Si
            // hoy está agotado lo dice el dispositivo, como
            // «abierto ahora»: la ficha puede quedar abierta de
            // un día para otro.
            'sold_out_until' => $dish->sold_out_until?->toDateString(),
            'ingredients' => $ingredients,
            'groups' => $this->groups($dish, $positions),
        ];
    }

    /**
     * Platos que lleva cada ingrediente agotado: id del ingrediente → id del
     * plato → si es esencial. Se arma una vez por ficha.
     *
     * @var array<int, array<int, bool>>|null
     */
    private ?array $links = null;

    /**
     * Los ingredientes agotados que tocan a este plato (#112, ADR 0033): los
     * que lleva (`in_dish`, con `essential`) y los que nombran sus opciones
     * (una adición agotada; un «Quitar» cuenta como que lo lleva). Con la
     * fecha hasta la que no hay: si hoy sigue agotado lo calcula el
     * dispositivo. El reemplazo va con su recargo y su propia fecha: uno
     * agotado no se ofrece. Devuelve también la posición de cada uno en la
     * lista, que es lo que cada opción publica en `ingredient` (el id de la
     * base no viaja).
     *
     * @return array{list<ProfileIngredient>, array<int, int>}
     */
    private function ingredients(Dish $dish): array
    {
        if (! $this->restaurant->relationLoaded('ingredients') || $this->restaurant->ingredients->isEmpty()) {
            return [[], []];
        }

        if ($this->links === null) {
            $this->links = [];

            foreach ($this->restaurant->ingredients as $ingredient) {
                foreach ($ingredient->dishLinks as $link) {
                    $this->links[$ingredient->id][$link->dish_id] = $link->essential;
                }
            }
        }

        $named = [];
        $removable = [];

        foreach ($dish->optionGroups as $group) {
            foreach ($group->options as $option) {
                if ($option->available && $option->ingredient_id !== null) {
                    $named[$option->ingredient_id] = true;

                    if ($group->kind === OptionGroupKind::Removal) {
                        $removable[$option->ingredient_id] = true;
                    }
                }
            }
        }

        $entries = [];
        $positions = [];

        foreach ($this->restaurant->ingredients as $ingredient) {
            $essential = $this->links[$ingredient->id][$dish->id] ?? null;

            if (($essential === null && ! isset($named[$ingredient->id])) || $ingredient->sold_out_until === null) {
                continue;
            }

            $substitute = $ingredient->substitute;
            $positions[$ingredient->id] = count($entries);
            $entries[] = [
                'name' => (string) $ingredient->translated('name', $this->locale),
                'essential' => $essential === true,
                'in_dish' => $essential !== null || isset($removable[$ingredient->id]),
                'sold_out_until' => $ingredient->sold_out_until->toDateString(),
                'substitute' => $substitute === null ? null : [
                    'name' => (string) $substitute->translated('name', $this->locale),
                    'price' => $ingredient->substitute_price_delta,
                    'sold_out_until' => $substitute->sold_out_until?->toDateString(),
                ],
            ];
        }

        return [$entries, $positions];
    }

    /**
     * Los grupos de opciones de un plato (#14, ADR 0023), en el orden del
     * restaurante: lo que hay que elegir, las adiciones con su recargo y los
     * ingredientes que se pueden quitar. Una opción que el dueño desactivó
     * no sale, y un grupo que se queda sin opciones tampoco.
     *
     * `max` nunca pasa de las opciones publicadas. `min` no se toca: si un
     * grupo obligatorio pide más de las que quedan, el plato no se puede
     * pedir y lo dice el dispositivo (resources/js/order/selection.ts).
     *
     * Una opción que es un ingrediente agotado lleva en `ingredient` su
     * posición en la lista `ingredients` del plato; las demás, null.
     *
     * @param  array<int, int>  $positions
     * @return list<ProfileOptionGroup>
     */
    private function groups(Dish $dish, array $positions): array
    {
        $groups = [];

        foreach ($dish->optionGroups as $group) {
            $removal = $group->kind === OptionGroupKind::Removal;
            $options = array_values($group->options
                ->filter(fn (Option $option): bool => $option->available)
                ->map(fn (Option $option): array => [
                    'name' => (string) $option->translated('name', $this->locale),
                    // Quitar un ingrediente no cambia el precio.
                    'price' => $removal ? 0 : $option->price_delta,
                    'ingredient' => $option->ingredient_id === null ? null : ($positions[$option->ingredient_id] ?? null),
                ])
                ->all());

            if ($options === []) {
                continue;
            }

            $groups[] = [
                'name' => (string) $group->translated('name', $this->locale),
                'kind' => $group->kind->value,
                'min' => $removal ? 0 : $group->min_choices,
                // Quitar no tiene tope: cualquier ingrediente de la lista.
                'max' => $removal ? count($options) : min($group->max_choices, count($options)),
                'options' => $options,
            ];
        }

        return $groups;
    }
}
