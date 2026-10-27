<?php

namespace App\Http\Requests;

use App\Enums\RemovalRelationship;
use Illuminate\Validation\Rule;

/** POST /restaurants/{slug}/removal (#20): «Pedir que retiren esta ficha». */
class StoreRemovalRequestRequest extends RestaurantContactRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            ...$this->contactRules(),
            'relationship' => ['required', Rule::enum(RemovalRelationship::class)],
            'reason' => ['required', 'string', 'max:'.self::TEXT_MAX, self::NOT_BLANK],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            ...parent::messages(),
            'relationship' => __('requests.error.relationship'),
            'reason' => __('requests.error.reason', ['max' => self::TEXT_MAX]),
        ];
    }
}
