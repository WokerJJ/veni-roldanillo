<?php

namespace App\Http\Requests;

use App\Enums\ClaimantRole;
use App\Rules\PlainText;
use Illuminate\Validation\Rule;

/** POST /restaurants/{slug}/claim (#20): «¿Es tu negocio? Reclámalo». */
class StoreRestaurantClaimRequest extends RestaurantContactRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            ...$this->contactRules(),
            'claimant_role' => ['required', Rule::enum(ClaimantRole::class)],
            'message' => ['nullable', 'string', PlainText::multiline(), 'max:'.self::TEXT_MAX],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            ...parent::messages(),
            'claimant_role' => __('requests.error.role'),
            'message' => __('requests.error.message', ['max' => self::TEXT_MAX]),
        ];
    }
}
