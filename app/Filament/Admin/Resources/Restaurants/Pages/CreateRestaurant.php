<?php

namespace App\Filament\Admin\Resources\Restaurants\Pages;

use App\Filament\Admin\Resources\Restaurants\RestaurantResource;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use App\Models\Restaurant;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Database\Eloquent\Model;

/**
 * Alta manual de una ficha (#19, ADR 0027): nace oculta por defecto, con el
 * slug sacado del nombre si se deja vacío.
 */
class CreateRestaurant extends CreateRecord
{
    use TranslatesConstraintViolations;

    protected static string $resource = RestaurantResource::class;

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleRecordCreation(array $data): Model
    {
        return $this->writeRespectingConstraints(fn (): Model => RestaurantResource::persist(new Restaurant, $data));
    }

    protected function constraintErrorField(?string $constraint): ?string
    {
        return match ($constraint) {
            'restaurants_slug_format', 'restaurants_slug_unique' => 'data.slug',
            default => null,
        };
    }

    protected function getRedirectUrl(): string
    {
        return RestaurantResource::getUrl('index');
    }
}
