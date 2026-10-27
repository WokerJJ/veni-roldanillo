<?php

namespace Database\Factories;

use App\Enums\ClaimStatus;
use App\Enums\RemovalRelationship;
use App\Models\Restaurant;
use App\Models\RestaurantRemovalRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Datos claramente ficticios: celulares 300 000 xxxx y correos de example.test.
 *
 * @extends Factory<RestaurantRemovalRequest>
 */
class RestaurantRemovalRequestFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'restaurant_id' => Restaurant::factory(),
            'status' => ClaimStatus::Pending,
            'contact_name' => 'Persona de Prueba',
            'contact_phone' => '57300000'.fake()->unique()->numerify('####'),
            'contact_email' => null,
            'relationship' => RemovalRelationship::Owner,
            'reason' => 'Solicitud de prueba.',
            'privacy_accepted_at' => now(),
            'reviewed_by' => null,
            'reviewed_at' => null,
        ];
    }

    public function approved(?User $reviewer = null): static
    {
        return $this->resolved(ClaimStatus::Approved, $reviewer);
    }

    public function rejected(?User $reviewer = null): static
    {
        return $this->resolved(ClaimStatus::Rejected, $reviewer);
    }

    private function resolved(ClaimStatus $status, ?User $reviewer): static
    {
        return $this->state(fn () => [
            'status' => $status,
            'reviewed_by' => $reviewer ?? User::factory()->admin(),
            'reviewed_at' => now(),
        ]);
    }
}
