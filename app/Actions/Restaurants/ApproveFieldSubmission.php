<?php

namespace App\Actions\Restaurants;

use App\Enums\FieldSubmissionStatus;
use App\Enums\PaymentMethod;
use App\Enums\RestaurantStatus;
use App\Models\CatalogItem;
use App\Models\CatalogVariant;
use App\Models\FieldSubmission;
use App\Models\Restaurant;
use App\Models\User;
use App\Support\Field\DuplicateFinder;
use App\Support\RestaurantSlug;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;

/**
 * Aprueba una captura del modo Campo (ADR 0048): crea la ficha OCULTA y
 * verificada (o completa la ficha oculta a la que se vinculó). No la publica:
 * eso lo hace PublishRestaurant.
 *
 * Solo aprueba con la confirmación del dueño y solo de lo que el dueño vio: la
 * huella confirmada tiene que ser la del contenido actual. Los duplicados
 * (fichas con nombre parecido o a menos de 50 m) tienen que estar resueltos:
 * completando esa ficha o declarando que es otro negocio. Todo en una
 * transacción, con la captura y la ficha leídas bloqueadas.
 */
final class ApproveFieldSubmission
{
    public function __construct(private readonly DuplicateFinder $duplicates) {}

    /**
     * @param  list<int>  $distinctFrom  fichas que administración declara «otro negocio» al aprobar
     *
     * @throws ActionRefused
     */
    public function handle(FieldSubmission $submission, User $reviewer, array $distinctFrom = []): Restaurant
    {
        if (! $reviewer->isAdmin()) {
            throw new AuthorizationException;
        }

        return DB::transaction(function () use ($submission, $reviewer, $distinctFrom): Restaurant {
            $locked = FieldSubmission::query()->lockForUpdate()->whereKey($submission->getKey())->firstOrFail();

            if ($locked->status !== FieldSubmissionStatus::OwnerConfirmed) {
                throw new ActionRefused($locked->status->isOpen() ? ActionRefused::NOT_CONFIRMED : ActionRefused::NOT_OPEN);
            }

            // Lo que el dueño confirmó tiene que ser lo que se aprueba.
            if ($locked->owner_confirmed_hash === null
                || ! hash_equals($locked->owner_confirmed_hash, $locked->contentHash())
                || ! hash_equals($locked->owner_confirmed_hash, $locked->payload_hash)) {
                throw new ActionRefused(ActionRefused::CONTENT_CHANGED);
            }

            $target = $locked->restaurant_id === null
                ? null
                : Restaurant::query()->lockForUpdate()->find($locked->restaurant_id);

            if ($locked->restaurant_id !== null && ($target === null || $target->status->isPublished() || $target->owners()->exists())) {
                throw new ActionRefused(ActionRefused::INVALID_TARGET);
            }

            // La ficha ya la completó otra captura aprobada: queda bloqueada (la fila de
            // la ficha está tomada, así que dos aprobaciones a la vez se turnan).
            if ($target !== null && FieldSubmission::query()->where('status', FieldSubmissionStatus::Approved->value)->where('restaurant_id', $target->getKey())->whereKeyNot($locked->getKey())->exists()) {
                throw new ActionRefused(ActionRefused::INVALID_TARGET);
            }

            $declared = array_values(array_unique(array_map('intval', [...($locked->duplicates['distinct_from'] ?? []), ...$distinctFrom])));

            $this->assertDuplicatesResolved($locked, $target, $declared);

            $restaurant = $target ?? new Restaurant;
            $payload = $locked->payload;

            $restaurant->fill([
                'name' => $payload['name'],
                'address' => $payload['address'],
                'reference' => $payload['reference'] ?? null,
                'location' => $locked->location,
                'phone' => $payload['phone'] ?? null,
                'whatsapp' => $payload['whatsapp'] ?? null,
                'delivery' => (bool) $payload['delivery'],
                'payment_methods' => array_map(fn (string $method): PaymentMethod => PaymentMethod::from($method), $payload['payment_methods']),
            ]);

            if ($target === null) {
                $restaurant->forceFill(['slug' => RestaurantSlug::unique($payload['name'])]);
            }

            // Oculta y verificada: se publica aparte, con PublishRestaurant.
            $restaurant->forceFill([
                'status' => RestaurantStatus::Hidden,
                'verified_at' => now(),
            ])->save();

            // La carta de una ficha que ya la tiene no se pisa en silencio (etapa 3).
            if (($payload['menu'] ?? []) !== [] && $restaurant->menuSections()->exists()) {
                throw new ActionRefused(ActionRefused::MENU_EXISTS);
            }

            $restaurant->categories()->sync($payload['category_ids']);
            $restaurant->openingHours()->delete();

            foreach ($payload['hours'] as $slot) {
                $restaurant->openingHours()->create([
                    'weekday' => $slot['weekday'],
                    'opens_at' => $slot['opens'],
                    'closes_at' => $slot['closes'],
                ]);
            }

            $this->createMenu($restaurant, $payload['menu'] ?? []);

            $locked->forceFill([
                'status' => FieldSubmissionStatus::Approved,
                'restaurant_id' => $restaurant->getKey(),
                'reviewed_by' => $reviewer->getKey(),
                'reviewed_at' => now(),
                'duplicates' => [...($locked->duplicates ?? []), 'distinct_from' => $declared],
            ])->save();

            $submission->setRawAttributes($locked->getAttributes(), sync: true);

            return $restaurant;
        });
    }

    /**
     * Las secciones y los platos de la carta capturada (ADR 0049). El inglés de
     * un plato de catálogo sale del catálogo si el teléfono no lo mandó: no es
     * parte de lo que firma el dueño. Cada sección propone si cuenta para el
     * rango de precios por su nombre, como siempre.
     *
     * @param  list<array{name_es: string, name_en: string|null, dishes: list<array{name_es: string, name_en: string|null, price: int, is_alcohol: bool, catalog_variant_id: int|null}>}>  $menu
     */
    private function createMenu(Restaurant $restaurant, array $menu): void
    {
        $variantIds = [];

        foreach ($menu as $section) {
            foreach ($section['dishes'] as $dish) {
                if ($dish['catalog_variant_id'] !== null && $dish['name_en'] === null) {
                    $variantIds[] = $dish['catalog_variant_id'];
                }
            }
        }

        $english = [];

        foreach (CatalogVariant::query()->with('item')->whereIn('id', $variantIds)->get() as $variant) {
            $item = $variant->item;

            if ($item instanceof CatalogItem && $item->name_en !== null) {
                $english[$variant->id] = CatalogItem::dishName($item->name_en, $item->brand, $variant->label);
            }
        }

        foreach ($menu as $position => $section) {
            $created = $restaurant->menuSections()->create([
                'name_es' => $section['name_es'],
                'name_en' => $section['name_en'],
                'position' => $position,
            ]);

            foreach ($section['dishes'] as $dishPosition => $dish) {
                $restaurant->dishes()->create([
                    'menu_section_id' => $created->getKey(),
                    'name_es' => $dish['name_es'],
                    'name_en' => $dish['name_en'] ?? ($dish['catalog_variant_id'] !== null ? ($english[$dish['catalog_variant_id']] ?? null) : null),
                    'price' => $dish['price'],
                    'is_alcohol' => $dish['is_alcohol'],
                    'position' => $dishPosition,
                ]);
            }
        }
    }

    /**
     * @param  list<int>  $declared
     */
    private function assertDuplicatesResolved(FieldSubmission $submission, ?Restaurant $target, array $declared): void
    {
        $candidates = $this->duplicates->find(
            $submission->payload['name'],
            $submission->location,
            $target instanceof Restaurant ? $target->id : null,
            $submission->uuid,
        );

        foreach ($candidates as $candidate) {
            if ($candidate['kind'] === 'restaurant' && ! in_array($candidate['restaurant_id'], $declared, true)) {
                throw new ActionRefused(ActionRefused::DUPLICATES_UNRESOLVED);
            }
        }
    }
}
