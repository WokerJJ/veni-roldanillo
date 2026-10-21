<?php

namespace App\Support\Osm;

use App\Support\GeoPoint;
use InvalidArgumentException;

/**
 * Un local de comida tal como se importa de OpenStreetMap (ADR 0021): el
 * objeto (tipo e id), su tipo de local, su nombre y su punto. Nada más: los
 * demás tags (teléfono, correo, sitio web, redes, horario) no se leen.
 */
final readonly class OsmPlace
{
    /**
     * Tipos de local que se importan, con su categoría en la app: la clave es
     * «tag=valor» de OpenStreetMap; el valor, el slug de la categoría.
     *
     * @var array<string, string>
     */
    public const array KINDS = [
        'amenity=restaurant' => 'restaurantes',
        'amenity=fast_food' => 'comidas-rapidas',
        'amenity=cafe' => 'panaderia-cafeteria',
        'amenity=bar' => 'bares',
        'amenity=pub' => 'bares',
        'amenity=ice_cream' => 'heladeria-postres',
        'amenity=food_court' => 'plazoletas-de-comida',
        'shop=bakery' => 'panaderia-cafeteria',
        'shop=pastry' => 'panaderia-cafeteria',
    ];

    /**
     * Cómo se lee cada tipo de local en el listado del recorrido.
     *
     * @var array<string, string>
     */
    public const array KIND_LABELS = [
        'amenity=restaurant' => 'restaurante',
        'amenity=fast_food' => 'comidas rápidas',
        'amenity=cafe' => 'café',
        'amenity=bar' => 'bar',
        'amenity=pub' => 'pub',
        'amenity=ice_cream' => 'heladería',
        'amenity=food_court' => 'plazoleta de comidas',
        'shop=bakery' => 'panadería',
        'shop=pastry' => 'pastelería',
    ];

    /**
     * Las categorías que la importación crea si faltan, con su nombre en
     * español e inglés. Una que ya existe se usa con el nombre que tenga.
     *
     * @var array<string, array{string, string}>
     */
    public const array CATEGORIES = [
        'restaurantes' => ['Restaurantes', 'Restaurants'],
        'comidas-rapidas' => ['Comidas rápidas', 'Fast food'],
        'panaderia-cafeteria' => ['Panadería y cafetería', 'Bakery and café'],
        'heladeria-postres' => ['Heladería y postres', 'Ice cream and desserts'],
        'bares' => ['Bares', 'Bars'],
        'plazoletas-de-comida' => ['Plazoletas de comida', 'Food courts'],
    ];

    /** Largo de la columna restaurants.name. */
    private const int NAME_LENGTH = 120;

    /**
     * @param  'node'|'way'|'relation'  $type
     */
    public function __construct(
        public string $type,
        public int $id,
        public string $kind,
        public ?string $name,
        public GeoPoint $point,
    ) {}

    /**
     * Lee un elemento de la respuesta de Overpass (`out tags center`). Null si
     * no es un local de los que se importan o no trae punto.
     *
     * @param  array<mixed>  $element
     */
    public static function fromElement(array $element): ?self
    {
        $type = $element['type'] ?? null;
        $id = $element['id'] ?? null;

        if (! in_array($type, ['node', 'way', 'relation'], true) || ! is_int($id) || $id <= 0) {
            return null;
        }

        $tags = is_array($element['tags'] ?? null) ? $element['tags'] : [];
        $kind = self::kindOf($tags);
        $coordinates = $type === 'node' ? $element : ($element['center'] ?? null);

        if ($kind === null || ! is_array($coordinates)) {
            return null;
        }

        $lat = $coordinates['lat'] ?? null;
        $lon = $coordinates['lon'] ?? null;

        if (! is_numeric($lat) || ! is_numeric($lon)) {
            return null;
        }

        try {
            $point = new GeoPoint((float) $lat, (float) $lon);
        } catch (InvalidArgumentException) {
            return null;
        }

        return new self($type, $id, $kind, self::nameOf($tags), $point);
    }

    public function category(): string
    {
        return self::KINDS[$this->kind];
    }

    public function url(): string
    {
        return "https://www.openstreetmap.org/{$this->type}/{$this->id}";
    }

    /** El tipo de local («amenity=cafe») como se lee en el listado. */
    public static function label(string $kind): string
    {
        return self::KIND_LABELS[$kind] ?? $kind;
    }

    /**
     * @param  array<mixed>  $tags
     */
    private static function kindOf(array $tags): ?string
    {
        foreach (['amenity', 'shop'] as $key) {
            $value = $tags[$key] ?? null;

            if (is_string($value) && isset(self::KINDS["{$key}={$value}"])) {
                return "{$key}={$value}";
            }
        }

        return null;
    }

    /**
     * @param  array<mixed>  $tags
     */
    private static function nameOf(array $tags): ?string
    {
        $name = $tags['name'] ?? null;

        if (! is_string($name)) {
            return null;
        }

        $name = trim((string) preg_replace('/\s+/u', ' ', $name));

        return $name === '' ? null : mb_substr($name, 0, self::NAME_LENGTH);
    }
}
