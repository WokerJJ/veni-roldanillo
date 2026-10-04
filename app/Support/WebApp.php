<?php

namespace App\Support;

use App\Enums\Locale;
use Illuminate\Support\Facades\File;
use InvalidArgumentException;
use UnexpectedValueException;

/**
 * La app instalable (PWA, #5): el manifest web y los colores de la barra del
 * sistema. Los colores salen de los tokens de la marca (brand/tokens.json, la
 * misma fuente que brand/tokens.css) y los íconos de brand/png, que la
 * compilación copia a public/build/icons (copyBrandIcons en vite.config.ts).
 */
final class WebApp
{
    /** El nombre de la marca no cambia con el entorno (APP_NAME) ni con el idioma. */
    public const NAME = 'Vení Roldanillo';

    public const SHORT_NAME = 'Vení';

    /** Donde quedan los PNG de brand/png después de `npm run build`. */
    public const ICONS_URL = '/build/icons/';

    /**
     * Íconos del manifest: archivo de brand/png, tamaño y uso. El maskable es
     * el mismo dibujo sin esquinas y con margen: Android lo recorta a su forma.
     *
     * @var list<array{file: string, sizes: string, purpose: string}>
     */
    public const ICONS = [
        ['file' => 'veni-icono-192.png', 'sizes' => '192x192', 'purpose' => 'any'],
        ['file' => 'veni-icono-512.png', 'sizes' => '512x512', 'purpose' => 'any'],
        ['file' => 'veni-icono-maskable-512.png', 'sizes' => '512x512', 'purpose' => 'maskable'],
    ];

    /** Ícono de la pantalla de inicio en iOS, que no lee los del manifest. */
    public const APPLE_TOUCH_ICON = 'favicon-180.png';

    /**
     * Color de fondo de la cabecera (--canvas en resources/css/app.css) por
     * tema: la barra del sistema se funde con ella.
     */
    private const THEME_COLORS = ['light' => 'blanco', 'dark' => 'ciruela'];

    /** @var array<string, string>|null */
    private static ?array $colors = null;

    /**
     * El manifest web. En español, el idioma por defecto: el navegador lo pide
     * sin cookies, así que no sabe qué idioma eligió la persona, y el
     * dispositivo lo guarda al instalar la app.
     *
     * @return array<string, mixed>
     */
    public static function manifest(): array
    {
        $locale = Locale::DEFAULT->value;

        return [
            'id' => '/',
            'name' => self::NAME,
            'short_name' => self::SHORT_NAME,
            'description' => __('meta.description', [], $locale),
            'lang' => $locale,
            'dir' => 'ltr',
            'start_url' => '/',
            'scope' => '/',
            'display' => 'standalone',
            'background_color' => self::themeColor('light'),
            'theme_color' => self::themeColor('light'),
            'icons' => array_map(fn (array $icon): array => [
                'src' => self::iconUrl($icon['file']),
                'sizes' => $icon['sizes'],
                'type' => 'image/png',
                'purpose' => $icon['purpose'],
            ], self::ICONS),
        ];
    }

    public static function iconUrl(string $file): string
    {
        return self::ICONS_URL.$file;
    }

    /** Color de la barra del sistema con el tema `light` o `dark`. */
    public static function themeColor(string $theme): string
    {
        $token = self::THEME_COLORS[$theme] ?? throw new InvalidArgumentException("Tema desconocido: «{$theme}».");

        return self::color($token);
    }

    /** Un color de brand/tokens.json por su nombre (`ciruela`, `blanco`…). */
    public static function color(string $name): string
    {
        return self::colors()[$name] ?? throw new InvalidArgumentException("La marca no tiene el color «{$name}».");
    }

    /**
     * Los tokens no cambian mientras la app corre: bajo Octane se leen una
     * sola vez por worker.
     *
     * @return array<string, string>
     */
    private static function colors(): array
    {
        if (self::$colors !== null) {
            return self::$colors;
        }

        $tokens = json_decode(File::get(base_path('brand/tokens.json')), true, flags: JSON_THROW_ON_ERROR);
        $colors = [];

        foreach (is_array($tokens) && is_array($tokens['color'] ?? null) ? $tokens['color'] : [] as $name => $token) {
            $value = is_array($token) ? ($token['$value'] ?? null) : null;

            if (! is_string($name) || ! is_string($value) || preg_match('/^#[0-9A-Fa-f]{6}$/', $value) !== 1) {
                throw new UnexpectedValueException('brand/tokens.json: cada color necesita un $value #RRGGBB.');
            }

            $colors[$name] = $value;
        }

        return self::$colors = $colors;
    }
}
