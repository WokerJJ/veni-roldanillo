<?php

namespace App\Http\Controllers\Field;

use App\Actions\Restaurants\ActionRefused;
use App\Actions\Restaurants\ConfirmFieldSubmission;
use App\Enums\LegalDocument;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\FieldSubmission;
use App\Support\Field\ConfirmationMessage;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * La página con que el dueño confirma la ficha, sin cuenta (ADR 0048). Es HTML
 * del servidor con un formulario común: no baja nada de JavaScript, abre en
 * cualquier celular y no suma peso al arranque. El `GET` solo muestra y no
 * consume nada (las vistas previas de WhatsApp abren los enlaces); el `POST`
 * con «Confirmo» consume el código. Un código que no existe, venció o ya se
 * usó responde igual: 404 sin pistas.
 */
class OwnerConfirmationController extends Controller
{
    public function show(string $code): View
    {
        $submission = FieldSubmission::awaitingCode($code) ?? abort(404);
        $payload = $submission->payload;

        $categories = Category::query()->whereIn('id', $payload['category_ids'])->orderBy('position')->get()
            ->map(fn (Category $category): string => (string) $category->translated('name'))->implode(', ');

        return view('field.confirm', [
            'code' => $code,
            'seenHash' => $submission->contentHash(),
            'name' => $payload['name'],
            'categories' => $categories,
            'address' => $payload['address'],
            'reference' => $payload['reference'],
            'phone' => $payload['phone'],
            'whatsapp' => $payload['whatsapp'],
            'delivery' => $payload['delivery'],
            'payments' => array_map(fn (string $method): string => __("field.payments.{$method}"), $payload['payment_methods']),
            'hours' => ConfirmationMessage::hoursLines($payload['hours'], app()->getLocale()),
            'menu' => $this->menuFor($payload['menu'] ?? []),
            'ownerName' => $submission->owner_name,
            'ownerRole' => $submission->owner_role->value,
            'privacyVersion' => LegalDocument::PRIVACY_VERSION,
            'authorizationVersion' => FieldSubmission::AUTHORIZATION_VERSION,
        ]);
    }

    /**
     * La carta lista para mostrar: cada plato con su precio en pesos («$3.500»)
     * y si es una bebida alcohólica.
     *
     * @param  list<array{name_es: string, name_en: string|null, dishes: list<array{name_es: string, name_en: string|null, price: int, is_alcohol: bool, catalog_variant_id: int|null}>}>  $menu
     * @return list<array{name: string, dishes: list<array{name: string, price: string, alcohol: bool}>}>
     */
    private function menuFor(array $menu): array
    {
        return array_map(fn (array $section): array => [
            'name' => $section['name_es'],
            'dishes' => array_map(fn (array $dish): array => [
                'name' => $dish['name_es'],
                'price' => '$'.number_format($dish['price'], 0, ',', '.'),
                'alcohol' => $dish['is_alcohol'],
            ], $section['dishes']),
        ], $menu);
    }

    public function store(Request $request, string $code, ConfirmFieldSubmission $confirm): RedirectResponse
    {
        $request->validate(['seen_hash' => ['required', 'string', 'size:64']]);
        $seen = $request->string('seen_hash')->toString();

        try {
            $confirm->handle($code, $seen);
        } catch (ActionRefused $refused) {
            if ($refused->reason === ActionRefused::CONTENT_CHANGED) {
                return back()->withErrors(['seen_hash' => __('field.confirm.changed')]);
            }

            abort(404);
        }

        return redirect()->route('field.confirm.done');
    }

    public function done(): View
    {
        return view('field.confirmed');
    }
}
