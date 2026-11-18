<?php

namespace App\Models;

use App\Casts\AsGeoPoint;
use App\Enums\ClaimantRole;
use App\Enums\FieldSubmissionStatus;
use App\Policies\FieldSubmissionPolicy;
use App\Support\GeoPoint;
use Carbon\CarbonInterface;
use Database\Factories\FieldSubmissionFactory;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @phpstan-type FieldPayload array{name: string, category_ids: list<int>, address: string, reference: string|null, phone: string|null, whatsapp: string|null, delivery: bool, payment_methods: list<string>, hours: list<array{weekday: int, opens: string, closes: string}>}
 *
 * Captura de una ficha en el local (modo Campo, ADR 0048). Todo lo escribe
 * el servidor desde una petición validada: no hay campos asignables en masa.
 * El contenido se identifica por su huella (contentHash): la confirmación del
 * dueño solo vale para la huella que vio.
 *
 * Las capturas devueltas o rechazadas se borran a los seis meses de resueltas;
 * las aprobadas se quedan mientras exista la ficha: son la prueba de la
 * autorización del dueño.
 *
 * @property FieldSubmissionStatus $status
 * @property ClaimantRole $owner_role
 * @property GeoPoint $location
 * @property FieldPayload $payload
 * @property array{candidates?: list<array<string, mixed>>, distinct_from?: list<int>}|null $duplicates
 * @property CarbonInterface|null $confirmation_expires_at
 * @property CarbonInterface|null $owner_confirmed_at
 * @property CarbonInterface $received_at
 * @property CarbonInterface $captured_at
 * @property CarbonInterface|null $reviewed_at
 */
#[UsePolicy(FieldSubmissionPolicy::class)]
class FieldSubmission extends Model
{
    /** @use HasFactory<FieldSubmissionFactory> */
    use HasFactory, MassPrunable;

    /** Versión del texto provisional de la autorización del dueño (ADR 0048). */
    public const string AUTHORIZATION_VERSION = '0.1';

    public const int CONFIRMATION_DAYS = 7;

    public const int RETENTION_MONTHS = 6;

    /** @var array<string, mixed> */
    protected $attributes = [
        'status' => 'submitted',
        'kind' => 'new_restaurant',
        'revision' => 1,
        'payload_version' => 1,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => FieldSubmissionStatus::class,
            'owner_role' => ClaimantRole::class,
            'location' => AsGeoPoint::class,
            'payload' => 'array',
            'duplicates' => 'array',
            'captured_at' => 'datetime',
            'received_at' => 'datetime',
            'confirmation_expires_at' => 'datetime',
            'owner_confirmed_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    /**
     * Huella de lo que el dueño confirma: el contenido de la ficha, el punto
     * y el contacto. Lo que decide administración (a qué ficha se vincula,
     * qué duplicados descarta) no cuenta.
     *
     * @param  FieldPayload  $payload
     */
    public static function hashContent(array $payload, GeoPoint $location, string $ownerName, string $ownerRole, string $ownerPhone): string
    {
        return hash('sha256', json_encode([
            'payload' => self::canonical($payload),
            'lat' => sprintf('%.7F', $location->latitude),
            'lng' => sprintf('%.7F', $location->longitude),
            'owner' => [$ownerName, $ownerRole, $ownerPhone],
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }

    public function contentHash(): string
    {
        return self::hashContent($this->payload, $this->location, $this->owner_name, $this->owner_role->value, $this->owner_phone);
    }

    /**
     * @param  array<mixed>  $value
     * @return array<mixed>
     */
    private static function canonical(array $value): array
    {
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = self::canonical($item);
            }
        }

        if (! array_is_list($value)) {
            ksort($value);
        }

        return $value;
    }

    /** El enlace del dueño: solo el SHA-256 del código se guarda. */
    public static function hashCode(string $code): string
    {
        return hash('sha256', $code);
    }

    /**
     * La captura que espera la confirmación con ese código: vigente, sin
     * usar y enviada. Cualquier otra cosa da null (sin pistas de por qué).
     */
    public static function awaitingCode(string $code): ?self
    {
        if (preg_match('/^[A-Za-z0-9_-]{43}$/', $code) !== 1) {
            return null;
        }

        return self::query()
            ->where('confirmation_token_hash', self::hashCode($code))
            ->where('status', FieldSubmissionStatus::Submitted->value)
            ->where('confirmation_expires_at', '>', now())
            ->first();
    }

    /** @return Builder<self> */
    public function prunable(): Builder
    {
        return self::query()
            ->whereIn('status', [FieldSubmissionStatus::Returned->value, FieldSubmissionStatus::Rejected->value])
            ->where('reviewed_at', '<', now()->subMonths(self::RETENTION_MONTHS));
    }

    /** @return BelongsTo<User, $this> */
    public function capturer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'captured_by');
    }

    /** @return BelongsTo<User, $this> */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }
}
