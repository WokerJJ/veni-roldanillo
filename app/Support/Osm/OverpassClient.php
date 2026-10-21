<?php

namespace App\Support\Osm;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Lee de Overpass los locales de comida de Roldanillo (ADR 0021).
 *
 * Primero por el límite administrativo del municipio; si esa consulta falla
 * (la de área suele dar 504), una sola vez más por el recuadro del límite: a
 * lo sumo dos consultas por corrida. Un 429 no se reintenta: Overpass está
 * pidiendo que se espere.
 */
class OverpassClient
{
    /** Relación del límite administrativo de Roldanillo en OpenStreetMap. */
    public const int BOUNDARY_RELATION = 1473594;

    /** Recuadro del límite (sur, oeste, norte, este): el respaldo. */
    public const string BOUNDARY_BBOX = '4.3712195,-76.2811191,4.5165178,-76.0657686';

    /** Segundos que Overpass dedica a la consulta; el cliente espera un poco más. */
    private const int QUERY_TIMEOUT = 90;

    public function fetch(): OverpassResult
    {
        $area = 3600000000 + self::BOUNDARY_RELATION;

        try {
            return new OverpassResult($this->query("area({$area})->.roldanillo;", '(area.roldanillo)'), withinBoundary: true);
        } catch (OverpassRateLimited $limited) {
            throw $limited;
        } catch (RuntimeException|ConnectionException) {
            return new OverpassResult($this->query('', '('.self::BOUNDARY_BBOX.')'), withinBoundary: false);
        }
    }

    /**
     * @return list<array<mixed>>
     */
    private function query(string $setup, string $filter): array
    {
        $amenities = 'restaurant|fast_food|cafe|bar|pub|ice_cream|food_court';
        $timeout = self::QUERY_TIMEOUT;
        $data = <<<OVERPASS
            [out:json][timeout:{$timeout}];
            {$setup}
            (
              nwr{$filter}["amenity"~"^({$amenities})$"];
              nwr{$filter}["shop"~"^(bakery|pastry)$"];
            );
            out tags center;
            OVERPASS;

        /** @var Response $response */
        $response = Http::withUserAgent(config()->string('services.overpass.user_agent'))
            ->acceptJson()
            ->asForm()
            ->timeout(self::QUERY_TIMEOUT + 30)
            ->post(config()->string('services.overpass.url'), ['data' => $data]);

        if ($response->status() === 429) {
            throw new OverpassRateLimited('Overpass pidió esperar (429).');
        }

        if (! $response->successful()) {
            throw new RuntimeException("Overpass respondió {$response->status()}.");
        }

        $body = $response->json();

        // Overpass responde 200 aunque la consulta se corte a medias: lo dice
        // en «remark». Una respuesta incompleta marcaría locales como idos.
        if (! is_array($body) || ! is_array($body['elements'] ?? null)) {
            throw new RuntimeException('Overpass no devolvió elementos.');
        }

        if (is_string($body['remark'] ?? null) && str_contains($body['remark'], 'error')) {
            throw new RuntimeException("Overpass cortó la consulta: {$body['remark']}");
        }

        return array_values(array_filter($body['elements'], is_array(...)));
    }
}
