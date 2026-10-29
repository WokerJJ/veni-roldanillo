<?php

namespace App\Http\Requests;

use App\Enums\Locale;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /api/dishes/search?q=…&lang=… (#17, ADR 0029). Como la capa del mapa,
 * el idioma va en la URL: la respuesta se guarda en cachés y una URL es
 * siempre la misma respuesta.
 *
 * La consulta: de 3 a 60 caracteres con al menos tres letras o números (lo
 * mismo que espera el buscador del inicio antes de preguntar), solo letras,
 * números, espacios, apóstrofos, guiones y puntos. Lo demás no ayuda a
 * encontrar un plato y es un 422.
 */
class DishSearchRequest extends FormRequest
{
    public const QUERY = 'q';

    public const LANG = 'lang';

    public const MIN_LENGTH = 3;

    public const MAX_LENGTH = 60;

    /** Es pública: la usa el buscador del inicio, sin cuenta. */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Espacios de más fuera, y los apóstrofos tipográficos del celular como «'».
     * Un guion al empezar una palabra pasa a ser un espacio: para Meilisearch
     * «-sancocho» es «sin sancocho», y aquí se busca un plato, no se excluye.
     */
    protected function prepareForValidation(): void
    {
        $query = $this->query(self::QUERY);

        if (is_string($query)) {
            $words = (string) preg_replace('/(?<!\S)-+/u', ' ', str_replace(['’', '‘', 'ʼ'], "'", $query));
            $clean = (string) preg_replace('/\s+/u', ' ', $words);
            $this->merge([self::QUERY => trim($clean)]);
        }
    }

    /**
     * @return array<string, list<ValidationRule|string>>
     */
    public function rules(): array
    {
        return [
            self::QUERY => [
                'required',
                'string',
                'min:'.self::MIN_LENGTH,
                'max:'.self::MAX_LENGTH,
                "regex:/^[\\p{L}\\p{M}\\p{N}' .\\-]+$/u",
                // Tres letras o números (las tildes sueltas no cuentan): «...» o «---» no buscan nada.
                'regex:/(?:\p{L}|\p{N}).*(?:\p{L}|\p{N}).*(?:\p{L}|\p{N})/su',
            ],
            self::LANG => ['sometimes', Rule::enum(Locale::class)],
        ];
    }

    public function searchQuery(): string
    {
        return $this->string(self::QUERY)->toString();
    }

    public function locale(): Locale
    {
        return $this->enum(self::LANG, Locale::class) ?? Locale::DEFAULT;
    }
}
