<?php

namespace Database\Factories;

use App\Models\Restaurant;
use App\Models\SpecialHour;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Por defecto un día cerrado; open() da un horario distinto al semanal.
 *
 * @extends Factory<SpecialHour>
 */
class SpecialHourFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'restaurant_id' => Restaurant::factory(),
            'on_date' => now()->addDays(fake()->numberBetween(1, 60))->toDateString(),
            'closed' => true,
            'opens_at' => null,
            'closes_at' => null,
            'note_es' => 'Cierre de prueba',
            'note_en' => 'Test closure',
        ];
    }

    public function open(string $opensAt = '12:00', string $closesAt = '16:00'): static
    {
        return $this->state(fn () => [
            'closed' => false,
            'opens_at' => $opensAt,
            'closes_at' => $closesAt,
        ]);
    }
}
