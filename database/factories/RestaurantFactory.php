<?php

namespace Database\Factories;

use App\Enums\PaymentMethod;
use App\Enums\RestaurantPlan;
use App\Enums\RestaurantStatus;
use App\Models\Restaurant;
use App\Support\GeoPoint;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * Restaurantes de ejemplo: siempre con is_fictitious = true, «(ficticio)» en
 * el nombre, coordenadas inventadas dentro del casco urbano de Roldanillo y
 * un WhatsApp que no puede existir (57 + número que empieza por 0).
 *
 * @extends Factory<Restaurant>
 */
class RestaurantFactory extends Factory
{
    /** Palabras inventadas para los nombres; no son negocios reales. */
    private const array NAMES = [
        'La Ceiba', 'El Guadual', 'Los Totumos', 'La Chiminea', 'El Fogón Azul',
        'La Mesa Larga', 'El Patio Lila', 'Las Tres Ollas', 'El Pilón', 'La Cazuela Mango',
    ];

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $n = fake()->unique()->numberBetween(1, 999_999);
        /** @var string $base */
        $base = fake()->randomElement(self::NAMES);

        return [
            'name' => "Restaurante de Prueba {$base} (ficticio)",
            'slug' => Str::slug("prueba {$base} {$n}"),
            'description_es' => 'Ficha de ejemplo para desarrollo. No corresponde a un negocio real.',
            'description_en' => 'Sample listing for development. Not a real business.',
            'address' => 'Calle de Prueba # '.fake()->numberBetween(1, 20).'-'.fake()->numberBetween(1, 99),
            'reference' => 'Dirección inventada',
            'location' => self::pointInRoldanillo(),
            'phone' => null,
            'whatsapp' => '570000'.fake()->numerify('######'),
            'price_level' => fake()->numberBetween(1, 4),
            'delivery' => fake()->boolean(),
            'payment_methods' => fake()->randomElements(PaymentMethod::cases(), fake()->numberBetween(1, 3)),
            'status' => RestaurantStatus::Unclaimed,
            'plan' => RestaurantPlan::Free,
            'is_fictitious' => true,
        ];
    }

    public function claimed(): static
    {
        return $this->state(fn () => [
            'status' => RestaurantStatus::Claimed,
            'verified_at' => now(),
        ]);
    }

    public function hidden(): static
    {
        return $this->state(fn () => ['status' => RestaurantStatus::Hidden]);
    }

    /**
     * Punto al azar en un recuadro pequeño del casco urbano de Roldanillo.
     */
    public static function pointInRoldanillo(): GeoPoint
    {
        return new GeoPoint(
            fake()->randomFloat(6, 4.4080, 4.4160),
            fake()->randomFloat(6, -76.1580, -76.1500),
        );
    }
}
