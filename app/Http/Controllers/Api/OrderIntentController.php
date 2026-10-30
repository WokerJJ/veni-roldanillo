<?php

namespace App\Http\Controllers\Api;

use App\Enums\Fulfillment;
use App\Http\Controllers\Controller;
use App\Models\OrderIntent;
use App\Models\Restaurant;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * POST /api/restaurants/{slug}/order-intents (#22, ADR 0031): el carrito
 * avisa que se tocó «Enviar pedido por WhatsApp», sin esperar la respuesta.
 *
 * El cuerpo es {"fulfillment": "delivery" | "pickup"} y nada más se lee:
 * cualquier otro campo se ignora y no se guarda. No hay persona ni
 * dispositivo: ni sesión (ruta de /api), ni user_id, ni device_hash.
 *
 * - 204: registrado, o repetido dentro de DEDUPE_SECONDS (un doble toque
 *   cuenta una vez; la respuesta es la misma para no dar pistas).
 * - 403: el navegador dice que la petición viene de otro sitio.
 * - 415: no es JSON. Sin sesión no hay token CSRF; exigir JSON hace que un
 *   formulario de otro sitio no pueda mandarlo (sin CORS, el navegador no
 *   deja enviar ese Content-Type a otro origen).
 * - 422: fulfillment falta o no es uno de los dos.
 * - 404: la ficha no existe, está oculta o no tiene WhatsApp. Responde igual
 *   en los tres casos, como la ficha pública.
 * - 429: pasó el límite por IP (AppServiceProvider::ORDER_INTENTS_PER_MINUTE).
 */
class OrderIntentController extends Controller
{
    /** Segundos en que un segundo toque desde la misma IP al mismo restaurante no cuenta. */
    public const DEDUPE_SECONDS = 10;

    public function __invoke(Request $request, string $slug): Response
    {
        if ($request->headers->get('Sec-Fetch-Site') === 'cross-site') {
            abort(403);
        }

        if (! $request->isJson()) {
            abort(415);
        }

        /** @var array{fulfillment: string} $data */
        $data = Validator::make($request->all(), [
            'fulfillment' => ['required', 'string', Rule::enum(Fulfillment::class)],
        ])->validate();

        $restaurantId = Restaurant::query()
            ->published()
            ->where('slug', $slug)
            ->whereNotNull('whatsapp')
            ->value('id');

        if (! is_int($restaurantId)) {
            abort(404);
        }

        // La IP solo vive en la llave de la caché, como huella (HMAC) y por
        // DEDUPE_SECONDS: nunca en order_intents.
        $key = 'order-intent:'.hash_hmac('sha256', $request->ip().'|'.$restaurantId, (string) config('app.key'));

        if (Cache::add($key, true, self::DEDUPE_SECONDS)) {
            $intent = new OrderIntent(['fulfillment' => Fulfillment::from($data['fulfillment'])]);
            $intent->restaurant()->associate($restaurantId);
            $intent->save();
        }

        return response()->noContent();
    }
}
