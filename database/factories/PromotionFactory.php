<?php

namespace Database\Factories;

use App\Models\Promotion;
use App\Models\Restaurant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Promotion>
 */
class PromotionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'restaurant_id' => Restaurant::factory(),
            'title_es' => 'Promoción de prueba',
            'title_en' => 'Test promotion',
            'starts_at' => now(),
            'ends_at' => now()->addDays(7),
        ];
    }
}
