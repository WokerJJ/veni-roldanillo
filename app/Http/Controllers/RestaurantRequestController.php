<?php

namespace App\Http\Controllers;

use App\Enums\ClaimStatus;
use App\Enums\RestaurantStatus;
use App\Http\Requests\RestaurantContactRequest;
use App\Http\Requests\StoreRemovalRequestRequest;
use App\Http\Requests\StoreRestaurantClaimRequest;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

/**
 * «¿Es tu negocio? Reclámalo» y «Pedir que retiren esta ficha» (#20, ADR
 * 0026). Quien escribe no tiene cuenta: deja un contacto mínimo y la
 * solicitud queda pendiente para que administración la revise a mano (#19).
 * Nada cambia solo: no se crea una cuenta, la ficha no se reclama ni se
 * oculta.
 *
 * Una sola solicitud pendiente por celular y restaurante: volver a enviarla
 * (el doble toque, recargar y reenviar) responde lo mismo y no la duplica.
 */
class RestaurantRequestController extends Controller
{
    /** Clave del aviso de «recibida» que lee la página después de redirigir. */
    public const SENT_FLASH = 'restaurant_request_sent';

    public function claim(Request $request, string $slug): Response
    {
        $restaurant = $this->claimable($slug);

        return $this->page('Restaurants/Claim', $request, $restaurant, 'claim');
    }

    public function storeClaim(StoreRestaurantClaimRequest $request, string $slug): RedirectResponse
    {
        $restaurant = $this->claimable($slug);

        if (! $request->isLikelyBot()) {
            /** @var array<string, mixed> $attributes */
            $attributes = $request->safe()->only(['contact_name', 'contact_phone', 'contact_email', 'claimant_role', 'message']);
            $claim = new RestaurantClaim($attributes);
            $claim->privacy_accepted_at = now();

            $this->savePendingOnce($restaurant->claims(), $claim);
        }

        return $this->sent($request, 'restaurants.claim', $restaurant, 'claim');
    }

    public function removal(Request $request, string $slug): Response
    {
        $restaurant = $this->published($slug);

        return $this->page('Restaurants/Removal', $request, $restaurant, 'removal');
    }

    public function storeRemoval(StoreRemovalRequestRequest $request, string $slug): RedirectResponse
    {
        $restaurant = $this->published($slug);

        if (! $request->isLikelyBot()) {
            /** @var array<string, mixed> $attributes */
            $attributes = $request->safe()->only(['contact_name', 'contact_phone', 'contact_email', 'relationship', 'reason']);
            $removal = new RestaurantRemovalRequest($attributes);
            $removal->privacy_accepted_at = now();

            $this->savePendingOnce($restaurant->removalRequests(), $removal);
        }

        return $this->sent($request, 'restaurants.removal', $restaurant, 'removal');
    }

    /**
     * Una ficha que cualquiera puede ver (la misma regla que la ficha
     * pública); oculta o inexistente, 404.
     */
    private function published(string $slug): Restaurant
    {
        $restaurant = Restaurant::query()
            ->select(['id', 'slug', 'name', 'status', 'is_fictitious'])
            ->where('slug', $slug)
            ->first();

        if ($restaurant === null || $restaurant->status === RestaurantStatus::Hidden || Gate::denies('view', $restaurant)) {
            abort(404);
        }

        return $restaurant;
    }

    /** Solo se reclama una ficha publicada que nadie reclamó todavía. */
    private function claimable(string $slug): Restaurant
    {
        $restaurant = $this->published($slug);

        abort_unless($restaurant->status === RestaurantStatus::Unclaimed, 404);

        return $restaurant;
    }

    private function page(string $component, Request $request, Restaurant $restaurant, string $kind): Response
    {
        return Inertia::render($component, [
            'restaurant' => [
                'slug' => $restaurant->slug,
                'name' => $restaurant->name,
                'fictitious' => $restaurant->is_fictitious,
            ],
            'sent' => $request->session()->get(self::SENT_FLASH) === $kind,
        ]);
    }

    private function sent(RestaurantContactRequest $request, string $route, Restaurant $restaurant, string $kind): RedirectResponse
    {
        $request->session()->flash(self::SENT_FLASH, $kind);

        return redirect()->route($route, ['slug' => $restaurant->slug], 303);
    }

    /**
     * Guarda la solicitud si no hay otra pendiente con ese celular. Si dos
     * envíos llegan a la vez, el índice único parcial frena al segundo; la
     * transacción anidada (un savepoint) evita que ese error tumbe la
     * transacción de afuera, que en PostgreSQL quedaría inservible.
     *
     * @template TModel of RestaurantClaim|RestaurantRemovalRequest
     *
     * @param  HasMany<TModel, Restaurant>  $relation
     * @param  TModel  $model
     */
    private function savePendingOnce(HasMany $relation, Model $model): void
    {
        $alreadyPending = $relation->clone()
            ->where('status', ClaimStatus::Pending->value)
            ->where('contact_phone', $model->getAttribute('contact_phone'))
            ->exists();

        if ($alreadyPending) {
            return;
        }

        try {
            DB::transaction(fn () => $relation->save($model));
        } catch (UniqueConstraintViolationException) {
            // Otro envío igual ganó la carrera: ya está pendiente.
        }
    }
}
