<?php

use App\Support\WebApp;
use Illuminate\Support\Facades\File;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/*
| Manifest web de la app instalable (#5): lo que Chrome y Android piden para
| ofrecer «Instalar» (nombre, start_url, display standalone e íconos de 192 y
| 512 px, uno maskable) y los colores de la marca.
*/

/**
 * @param  TestResponse<Response>  $response
 * @return array<string, mixed>
 */
function webManifestOf(TestResponse $response): array
{
    $manifest = json_decode((string) $response->getContent(), true, flags: JSON_THROW_ON_ERROR);

    expect($manifest)->toBeArray();

    /** @var array<string, mixed> $manifest */
    return $manifest;
}

/** Color de brand/tokens.json, leído aparte de App\Support\WebApp. */
function brandTokenColor(string $name): string
{
    $tokens = json_decode(File::get(base_path('brand/tokens.json')), true, flags: JSON_THROW_ON_ERROR);

    return $tokens['color'][$name]['$value'];
}

test('se sirve como manifest web, con caché de un día', function () {
    $response = $this->get('/manifest.webmanifest')->assertOk();

    expect($response->headers->get('Content-Type'))->toBe('application/manifest+json')
        ->and($response->headers->get('Cache-Control'))->toContain('public')->toContain('max-age=86400');
});

test('trae lo que el navegador exige para instalar la app', function () {
    $manifest = webManifestOf($this->get('/manifest.webmanifest'));

    expect($manifest)
        ->toMatchArray([
            'id' => '/',
            'name' => 'Vení Roldanillo',
            'short_name' => 'Vení',
            'start_url' => '/',
            'scope' => '/',
            'display' => 'standalone',
        ])
        ->and($manifest['short_name'])->toBeString();

    // En el inicio de Android caben unos 12 caracteres sin cortarse.
    expect(mb_strlen((string) $manifest['short_name']))->toBeLessThanOrEqual(12);
});

test('está en español, con la descripción de los archivos de idioma', function () {
    $manifest = webManifestOf($this->get('/manifest.webmanifest', ['Accept-Language' => 'en']));
    $description = trans('meta.description', [], 'es');

    expect($description)->not->toBe('meta.description');
    expect($manifest)->toMatchArray([
        'lang' => 'es',
        'dir' => 'ltr',
        'description' => $description,
    ]);
});

test('usa los colores de la marca del tema claro', function () {
    $manifest = webManifestOf($this->get('/manifest.webmanifest'));

    // El fondo de la cabecera en claro (--canvas): la barra del sistema y la
    // pantalla de arranque se funden con la app.
    expect($manifest['theme_color'])->toBe(brandTokenColor('blanco'))
        ->and($manifest['background_color'])->toBe(brandTokenColor('blanco'));
});

test('ofrece los íconos de la marca de 192 y 512 px y uno maskable', function () {
    $icons = collect(webManifestOf($this->get('/manifest.webmanifest'))['icons']);

    expect($icons->map(fn (array $icon): string => $icon['sizes'].' '.$icon['purpose'])->all())
        ->toBe(['192x192 any', '512x512 any', '512x512 maskable']);

    foreach ($icons as $icon) {
        expect($icon['type'])->toBe('image/png')
            ->and($icon['src'])->toStartWith('/build/icons/');

        // La compilación los copia de brand/png con el mismo nombre: el
        // archivo existe y mide lo que declara el manifest.
        $source = base_path('brand/png/'.basename($icon['src']));
        expect(File::exists($source))->toBeTrue("Falta {$source}");

        [$width, $height, $type] = getimagesize($source) ?: [0, 0, 0];
        expect("{$width}x{$height}")->toBe($icon['sizes'])
            ->and($type)->toBe(IMAGETYPE_PNG);
    }
});

test('los íconos son los que copia la compilación', function () {
    // vite.config.ts (copyBrandIcons) copia la misma lista a public/build/icons.
    $viteConfig = File::get(base_path('vite.config.ts'));
    $files = [...array_column(WebApp::ICONS, 'file'), WebApp::APPLE_TOUCH_ICON];

    foreach ($files as $file) {
        expect($viteConfig)->toContain("'{$file}'");
    }
});

test('no abre sesión ni deja cookies', function () {
    // Va sin el grupo web: el navegador lo pide sin cookies y cada petición
    // abriría una sesión nueva.
    $response = $this->get('/manifest.webmanifest')->assertOk();

    expect($response->headers->getCookies())->toBe([])
        ->and((string) $response->headers->get('Vary'))->not->toContain('Cookie');
});

test('lleva las cabeceras de seguridad de toda respuesta', function () {
    $this->get('/manifest.webmanifest')
        ->assertOk()
        ->assertHeader('X-Content-Type-Options', 'nosniff');
});
