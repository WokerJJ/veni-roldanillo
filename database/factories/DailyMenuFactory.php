<?php

namespace Database\Factories;

use App\Models\DailyMenu;
use App\Models\Restaurant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DailyMenu>
 */
class DailyMenuFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'restaurant_id' => Restaurant::factory(),
            'served_on' => now()->toDateString(),
            'description_es' => 'Almuerzo de prueba: sopa, arroz, principio, proteína y jugo.',
            'description_en' => 'Test lunch: soup, rice, side, protein and juice.',
            'price' => fake()->numberBetween(24, 40) * 500,
        ];
    }
}
