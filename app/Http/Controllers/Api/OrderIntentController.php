<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOrderIntentRequest;
use App\Models\OrderIntent;
use App\Models\Restaurant;
use App\Support\ClientFingerprint;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\RateLimiter;

/**
 * POST /api/restaurants/{slug}/order-intents (#22, ADR 0031): el carrito
 * avisa que se tocó «Enviar pedido por WhatsApp», sin esperar la respuesta.
 *
 * El cuerpo es {"fulfillment": "delivery" | "pickup"} y nada más se lee
 * (StoreOrderIntentRequest): cualquier otro campo se ignora y no se guarda.
 * No hay persona ni dispositivo: ni sesión (ruta de /api), ni user_id, ni
 * device_hash.
 *
 * - 204: registrado; o repetido dentro de DEDUPE_SECONDS (un doble toque
 *   cuenta una vez); o pasado el tope de DAILY_MAX por día desde la misma IP
 *   (o /64) al mismo restaurante. La respuesta es la misma para no dar pistas.
 * - 403 y 415: los pone RequireSameOriginJson (otro sitio, o no es JSON).
 * - 422: fulfillment falta o no es uno de los dos.
 * - 404: la ficha no existe, está oculta o no tiene WhatsApp. Responde igual
 *   en los tres casos, como la ficha pública.
 * - 429: pasó el límite por IP (AppServiceProvider::ORDER_INTENTS_PER_MINUTE).
 */
class OrderIntentController extends Controller
{
    /** Segundos en que un segundo toque desde la misma IP, al mismo restaurante y con la misma entrega, no cuenta. */
    public const DEDUPE_SECONDS = 10;

    /** Toques que cuentan por día desde la misma IP (o /64) a un mismo restaurante. */
    public const DAILY_MAX = 20;

    public const DAILY_SECONDS = 86_400;

    public function __invoke(StoreOrderIntentRequest $request, string $slug): Response
    {
        $fulfillment = $request->fulfillment();

        $restaurantId = Restaurant::query()
            ->published()
            ->where('slug', $slug)
            ->whereNotNull('whatsapp')
            ->value('id');

        if (! is_int($restaurantId)) {
            abort(404);
        }

        // La IP solo vive en las llaves de la caché, como huella (HMAC con
        // APP_KEY, ClientFingerprint) y hasta que vencen: nunca en
        // order_intents. hit() suma y devuelve en un paso, así dos toques a la
        // vez no cuentan los dos. El doble toque se mira antes del tope, para
        // que un toque repetido no gaste el cupo del día.
        $dedupe = 'order-intent:dedupe:'.ClientFingerprint::of($request, $restaurantId, $fulfillment->value);
        $daily = 'order-intent:daily:'.ClientFingerprint::of($request, $restaurantId);

        if (RateLimiter::hit($dedupe, self::DEDUPE_SECONDS) > 1
            || RateLimiter::hit($daily, self::DAILY_SECONDS) > self::DAILY_MAX) {
            return response()->noContent();
        }

        $intent = new OrderIntent(['fulfillment' => $fulfillment]);
        $intent->restaurant()->associate($restaurantId);
        $intent->save();

        return response()->noContent();
    }
}
