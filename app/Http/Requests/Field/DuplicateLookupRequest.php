<?php

namespace App\Http\Requests\Field;

use App\Models\FieldSubmission;
use Illuminate\Foundation\Http\FormRequest;

/**
 * El cuerpo de `POST /campo/api/duplicates` (ADR 0048): el nombre y el punto de
 * la ficha que se está capturando. El punto cae en el mismo recuadro de
 * Roldanillo que el envío (StoreFieldSubmissionRequest): un GPS sin fijar no
 * llega a la consulta espacial.
 */
class DuplicateLookupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', FieldSubmission::class) === true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'latitude' => ['required', 'numeric', 'between:'.StoreFieldSubmissionRequest::LAT_MIN.','.StoreFieldSubmissionRequest::LAT_MAX],
            'longitude' => ['required', 'numeric', 'between:'.StoreFieldSubmissionRequest::LNG_MIN.','.StoreFieldSubmissionRequest::LNG_MAX],
            'uuid' => ['nullable', 'uuid'],
        ];
    }
}
