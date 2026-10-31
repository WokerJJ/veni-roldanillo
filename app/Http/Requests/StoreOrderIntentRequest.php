<?php

namespace App\Http\Requests;

use App\Enums\Fulfillment;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /api/restaurants/{slug}/order-intents (#22, ADR 0031): el cuerpo es
 * {"fulfillment": "delivery" | "pickup"} y nada más se lee. La forma está en
 * tests/contracts/order-intent.request.json.
 *
 * Se valida solo el cuerpo JSON: la query string no cuenta (con $request->all()
 * un «?fulfillment=pickup» con cuerpo vacío pasaba). Que sea JSON y venga de
 * la app lo exige antes el middleware RequireSameOriginJson.
 */
class StoreOrderIntentRequest extends FormRequest
{
    /** Es pública: la manda el carrito, sin cuenta. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function validationData(): array
    {
        return $this->json()->all();
    }

    /**
     * @return array<string, array<int, ValidationRule|string>>
     */
    public function rules(): array
    {
        return [
            'fulfillment' => ['required', 'string', Rule::enum(Fulfillment::class)],
        ];
    }

    public function fulfillment(): Fulfillment
    {
        // Las reglas ya exigieron un texto que es uno de los casos.
        $value = $this->validated('fulfillment');

        return Fulfillment::from(is_string($value) ? $value : '');
    }
}
