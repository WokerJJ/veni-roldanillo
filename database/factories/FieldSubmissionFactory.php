<?php

namespace Database\Factories;

use App\Enums\ClaimantRole;
use App\Enums\FieldSubmissionStatus;
use App\Models\Category;
use App\Models\FieldSubmission;
use App\Models\User;
use App\Support\GeoPoint;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * Capturas de ejemplo del modo Campo: negocio inventado, celulares que no
 * pueden existir (57 + número que empieza por 3 pero de prueba) y un punto
 * dentro del casco urbano de Roldanillo.
 *
 * @extends Factory<FieldSubmission>
 */
class FieldSubmissionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $point = RestaurantFactory::pointInRoldanillo();
        $payload = [
            'name' => 'Negocio de Campo '.fake()->unique()->numberBetween(1, 999_999).' (ficticio)',
            'category_ids' => [Category::factory()->create()->id],
            'address' => 'Calle de Prueba # 1-23',
            'reference' => 'Frente al parque',
            'phone' => null,
            'whatsapp' => '573000000000',
            'delivery' => true,
            'payment_methods' => ['cash', 'nequi'],
            'hours' => [['weekday' => 1, 'opens' => '11:00', 'closes' => '15:00']],
        ];
        $ownerName = 'Persona de Prueba';
        $ownerPhone = '573000000001';

        return [
            'uuid' => (string) Str::uuid(),
            'status' => FieldSubmissionStatus::Submitted,
            'captured_by' => User::factory()->admin(),
            'captured_at' => now()->subMinutes(5),
            'received_at' => now(),
            'payload' => $payload,
            'payload_hash' => FieldSubmission::hashContent($payload, $point, $ownerName, ClaimantRole::Owner->value, $ownerPhone),
            'location' => $point,
            'location_source' => 'device',
            'owner_name' => $ownerName,
            'owner_role' => ClaimantRole::Owner,
            'owner_phone' => $ownerPhone,
        ];
    }

    /** Capturada con el contenido ya confirmado por el dueño. */
    public function confirmed(): static
    {
        return $this->state(fn (array $attributes): array => [
            'status' => FieldSubmissionStatus::OwnerConfirmed,
            'owner_confirmed_at' => now(),
            'owner_confirmed_hash' => $attributes['payload_hash'],
            'confirmation_phone' => $attributes['owner_phone'],
            'owner_privacy_notice_version' => '0.5',
            'owner_authorization_version' => FieldSubmission::AUTHORIZATION_VERSION,
        ]);
    }

    /** En un punto dado: la huella se recalcula. */
    public function at(GeoPoint $point): static
    {
        return $this->state(function (array $attributes) use ($point): array {
            /** @var array{payload: array{name: string, category_ids: list<int>, address: string, reference: string|null, phone: string|null, whatsapp: string|null, delivery: bool, payment_methods: list<string>, hours: list<array{weekday: int, opens: string, closes: string}>}, owner_name: string, owner_role: ClaimantRole, owner_phone: string} $attributes */
            $hash = FieldSubmission::hashContent($attributes['payload'], $point, $attributes['owner_name'], $attributes['owner_role']->value, $attributes['owner_phone']);

            return ['location' => $point, 'payload_hash' => $hash];
        });
    }
}
