<?php

namespace App\Support\Field;

use App\Enums\FieldSubmissionStatus;
use App\Support\GeoPoint;
use Illuminate\Support\Facades\DB;

/**
 * Candidatos a duplicado de una captura (ADR 0048): fichas (publicadas,
 * ocultas y borradores de OpenStreetMap) con un nombre parecido o a menos de
 * 50 m, y otras capturas en curso. El nombre se compara sin tildes ni
 * mayúsculas con pg_trgm. Solo lo usa administración y devuelve lo mínimo.
 */
final class DuplicateFinder
{
    public const int RADIUS_METERS = 50;

    public const float MIN_SIMILARITY = 0.4;

    private const int LIMIT = 10;

    /**
     * @return list<array{kind: string, id: int|string, restaurant_id: int|null, name: string, status: string, distance_m: int, similarity: float, from_osm: bool}>
     */
    public function find(string $name, GeoPoint $point, ?int $exceptRestaurantId = null, ?string $exceptUuid = null): array
    {
        $ewkt = $point->toEwkt();

        $restaurants = DB::select(<<<'SQL'
            SELECT r.id, r.name, r.status,
                   ST_Distance(r.location, ST_GeogFromText(?))::int AS distance_m,
                   similarity(unaccent(lower(r.name)), unaccent(lower(?)))::float AS similarity,
                   EXISTS (SELECT 1 FROM restaurant_sources s WHERE s.restaurant_id = r.id) AS from_osm
            FROM restaurants r
            WHERE (ST_DWithin(r.location, ST_GeogFromText(?), ?)
                   OR similarity(unaccent(lower(r.name)), unaccent(lower(?))) >= ?)
              AND (?::bigint IS NULL OR r.id <> ?::bigint)
            ORDER BY distance_m
            LIMIT ?
            SQL, [$ewkt, $name, $ewkt, self::RADIUS_METERS, $name, self::MIN_SIMILARITY, $exceptRestaurantId, $exceptRestaurantId, self::LIMIT]);

        $found = [];

        foreach ($restaurants as $row) {
            /** @var object{id: int|string, name: string, status: string, distance_m: int|string, similarity: float|string, from_osm: bool} $row */
            $found[] = [
                'kind' => 'restaurant',
                'id' => (int) $row->id,
                'restaurant_id' => (int) $row->id,
                'name' => (string) $row->name,
                'status' => (string) $row->status,
                'distance_m' => (int) $row->distance_m,
                'similarity' => round((float) $row->similarity, 2),
                'from_osm' => (bool) $row->from_osm,
            ];
        }

        $inFlight = DB::select(<<<'SQL'
            SELECT f.uuid, f.payload->>'name' AS name, f.status,
                   ST_Distance(f.location, ST_GeogFromText(?))::int AS distance_m,
                   similarity(unaccent(lower(f.payload->>'name')), unaccent(lower(?)))::float AS similarity
            FROM field_submissions f
            WHERE f.status IN (?, ?)
              AND (?::uuid IS NULL OR f.uuid <> ?::uuid)
              AND (ST_DWithin(f.location, ST_GeogFromText(?), ?)
                   OR similarity(unaccent(lower(f.payload->>'name')), unaccent(lower(?))) >= ?)
            ORDER BY distance_m
            LIMIT ?
            SQL, [
            $ewkt, $name,
            FieldSubmissionStatus::Submitted->value, FieldSubmissionStatus::OwnerConfirmed->value,
            $exceptUuid, $exceptUuid,
            $ewkt, self::RADIUS_METERS, $name, self::MIN_SIMILARITY, self::LIMIT,
        ]);

        foreach ($inFlight as $row) {
            /** @var object{uuid: string, name: string, status: string, distance_m: int|string, similarity: float|string} $row */
            $found[] = [
                'kind' => 'submission',
                'id' => (string) $row->uuid,
                'restaurant_id' => null,
                'name' => (string) $row->name,
                'status' => (string) $row->status,
                'distance_m' => (int) $row->distance_m,
                'similarity' => round((float) $row->similarity, 2),
                'from_osm' => false,
            ];
        }

        return $found;
    }
}
