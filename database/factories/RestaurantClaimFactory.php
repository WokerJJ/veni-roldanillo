<?php

namespace Database\Factories;

use App\Enums\ClaimStatus;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RestaurantClaim>
 */
class RestaurantClaimFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'restaurant_id' => Restaurant::factory(),
            'user_id' => User::factory(),
            'status' => ClaimStatus::Pending,
            'message' => 'Solicitud de prueba.',
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
