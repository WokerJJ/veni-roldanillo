<?php

namespace App\Http\Requests;

use App\Enums\Locale;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /api/restaurants.geojson. El idioma va en la URL (`?lang=en`) y no se
 * saca de la cookie ni de Accept-Language: la respuesta se guarda en cachés,
 * y así una URL es siempre la misma respuesta para cualquiera.
 */
class RestaurantsGeoJsonRequest extends FormRequest
{
    public const LANG = 'lang';

    /** Es público: lo pide el mapa del inicio, sin cuenta. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, list<ValidationRule|string>>
     */
    public function rules(): array
    {
        return [
            // Si viene, tiene que ser un idioma de la app: uno desconocido es
            // un 422, no español en silencio guardado bajo otra URL.
            self::LANG => ['sometimes', Rule::enum(Locale::class)],
        ];
    }

    /** Idioma de los nombres de las categorías; sin parámetro, español. */
    public function locale(): Locale
    {
        return $this->enum(self::LANG, Locale::class) ?? Locale::DEFAULT;
    }
}
