<?php

use App\Support\MapPreload;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Vite;

/*
| Plantilla raíz de Inertia (resources/views/app.blade.php).
|
| El enlace «Saltar al contenido» y su destino (#contenido) los pinta Vue en
| el navegador (AppLayout.vue); sin SSR no aparecen en este HTML.
*/

beforeEach(function () {
    // Manifest de Vite propio (tests/Pest.php): la prueba ejercita @vite sin
    // withoutVite() y sin depender de `npm run build`.
    fakeViteManifest();
});

test('declara el español como idioma del documento', function () {
    $this->get('/')
        ->assertOk()
        ->assertSee('<html lang="es"', false);
});

test('la descripción del documento llega en el idioma de la petición', function (string $locale) {
    $description = trans('meta.description', [], $locale);

    // Si faltara la traducción, trans() devolvería la clave.
    expect($description)->not->toBe('meta.description');

    $this->get('/?lang='.$locale)
        ->assertOk()
        ->assertSee('<html lang="'.$locale.'"', false)
        ->assertSee('<meta name="description" content="'.e($description).'">', false);
})->with(['es', 'en']);

test('aplica el tema guardado antes de pintar', function () {
    $this->get('/')
        ->assertOk()
        ->assertSee("localStorage.getItem('veni:theme')", false)
        ->assertSee('document.documentElement.dataset.theme = theme', false);
});

test('la clave del tema coincide con la del composable del frontend', function () {
    $composable = File::get(resource_path('js/composables/useTheme.ts'));

    expect($composable)->toContain("THEME_STORAGE_KEY = 'veni:theme'");
});

test('precarga las fuentes autohospedadas', function () {
    $this->get('/')
        ->assertOk()
        ->assertSee('<link rel="preload" href="/fonts/figtree-latin-400-700.woff2" as="font" type="font/woff2" crossorigin>', false)
        ->assertSee('<link rel="preload" href="/fonts/bricolage-grotesque-latin-700-800.woff2" as="font" type="font/woff2" crossorigin>', false);
});

test('adelanta la conexión con el host del mapa', function (string $styleUrl, string $origin) {
    // El estilo, los tiles, las fuentes y los sprites se piden con fetch a
    // otro origen: `crossorigin` abre la conexión que esas peticiones usan.
    config(['services.map.style_url' => $styleUrl]);

    $this->get('/')
        ->assertOk()
        ->assertSee('<link rel="preconnect" href="'.$origin.'" crossorigin>', false);
})->with([
    'la demo de veni-mapa' => ['https://wokerjj.github.io/veni-mapa/style/veni-{theme}-{locale}.json', 'https://wokerjj.github.io'],
    'una release fija' => ['https://tiles.example.test/v1.2.3/veni-{theme}-{locale}.json', 'https://tiles.example.test'],
    'con puerto' => ['http://localhost:8765/style/veni-{theme}-{locale}.json', 'http://localhost:8765'],
]);

test('sin una URL del mapa que sirva no adelanta ninguna conexión', function (?string $styleUrl) {
    config(['services.map.style_url' => $styleUrl]);

    $this->get('/')
        ->assertOk()
        ->assertDontSee('rel="preconnect"', false);
})->with([
    'sin definir' => [null],
    'vacía' => [''],
    'sin host' => ['/style/veni-{theme}-{locale}.json'],
    'otro esquema' => ['javascript://tiles.example.test/veni-{theme}-{locale}.json'],
    'con comillas' => ['https://tiles.example.test"><script>alert(1)</script>/veni.json'],
]);

test('carga la entrada compilada y la página desde el manifest', function () {
    $this->get('/')
        ->assertOk()
        ->assertSee('build/assets/app-prueba.js', false)
        ->assertSee('build/assets/app-prueba.css', false)
        ->assertSee('build/assets/Home-prueba.js', false);
});

test('las pantallas sin mapa no cargan ni precargan MapLibre', function () {
    // ADR 0007. Quien visita una página sin mapa no debe descargar su código
    // ni su CSS; en las que lo tienen, lo pide el componente al montarse (y el
    // inicio lo adelanta desde el HTML: ADR 0050, más abajo).
    $this->get('/credits')
        ->assertOk()
        ->assertSee('build/assets/Credits-prueba.js', false)
        ->assertDontSee('engine-prueba', false)
        ->assertDontSee('motor-compartido-prueba', false);
});

test('enlaza el manifest de la app instalable', function () {
    $this->get('/')
        ->assertOk()
        ->assertSee('<link rel="manifest" href="/manifest.webmanifest">', false);
});

test('pinta la barra del sistema con el fondo de la cabecera en claro y en oscuro', function () {
    $tokens = json_decode(File::get(base_path('brand/tokens.json')), true, flags: JSON_THROW_ON_ERROR);
    $light = $tokens['color']['blanco']['$value'];
    $dark = $tokens['color']['ciruela']['$value'];

    $this->get('/')
        ->assertOk()
        ->assertSee('<meta name="theme-color" content="'.$light.'" media="(prefers-color-scheme: light)">', false)
        ->assertSee('<meta name="theme-color" content="'.$dark.'" media="(prefers-color-scheme: dark)">', false);
});

test('da a iOS el ícono de la pantalla de inicio', function () {
    $this->get('/')
        ->assertOk()
        ->assertSee('<link rel="apple-touch-icon" href="/build/icons/favicon-180.png">', false);
});

test('el inicio adelanta el motor del mapa, después de la entrada y de la página', function () {
    // El motor baja con import() al montar el mapa (ADR 0007): sin este aviso
    // empieza a bajar recién cuando la entrada terminó de ejecutarse (ADR 0050).
    $html = $this->get('/')->assertOk()->getContent();

    preg_match('/<meta property="csp-nonce" nonce="([^"]+)"/', $html, $found);
    $nonce = $found[1] ?? '';
    expect($nonce)->not->toBeEmpty();

    $page = '<script type="module" src="'.asset('build/assets/Home-prueba.js').'"';
    $engine = '<link rel="modulepreload" href="'.asset('build/assets/engine-prueba.js').'" nonce="'.$nonce.'">';
    $shared = '<link rel="modulepreload" href="'.asset('build/assets/motor-compartido-prueba.js').'" nonce="'.$nonce.'">';

    expect($html)
        ->toContain($page)
        ->toContain($engine)
        ->toContain($shared)
        // Después de @vite: la entrada y la página se piden antes que el motor.
        ->and(strpos($html, $page))->toBeLessThan(strpos($html, $engine));
});

// Prueba negativa: fija la decisión del ADR 0050 (se probó adelantar la lista y el
// navegador no reutilizaba la petición); no mide nada, la evidencia está en el ADR.
test('el inicio no adelanta la lista de restaurantes: el navegador no reutilizaba la petición y la pedía dos veces', function () {
    $this->get('/')
        ->assertOk()
        ->assertDontSee('restaurants.geojson', false);
});

test('las páginas sin mapa no adelantan el motor', function () {
    $this->get('/credits')
        ->assertOk()
        ->assertDontSee('engine-prueba', false)
        ->assertDontSee('motor-compartido-prueba', false);
});

test('sin compilación del frontend no adelanta el motor', function () {
    expect(MapPreload::engineModules())->not->toBeEmpty();

    File::delete(public_path('build/manifest.json'));

    expect(MapPreload::engineModules())->toBe([]);
});

/**
 * Escribe un manifest propio en el public temporal de la prueba (antes de que
 * Vite lo lea: lo guarda en memoria por ruta).
 *
 * @param  array<string, mixed>|string  $manifest
 */
function writeManifest(array|string $manifest): void
{
    File::put(public_path('build/manifest.json'), is_string($manifest) ? $manifest : (string) json_encode($manifest));
}

test('un manifest malformado no adelanta nada', function (string $contents) {
    writeManifest($contents);

    expect(MapPreload::engineModules())->toBe([]);
})->with([
    'no es JSON' => ['{no es json'],
    'es un escalar' => ['42'],
    'el motor no es un objeto' => ['{"resources/js/map/engine.ts": "x"}'],
]);

test('un manifest sin la clave del motor no adelanta nada', function () {
    writeManifest(['resources/js/app.ts' => ['file' => 'assets/app-prueba.js']]);

    expect(MapPreload::engineModules())->toBe([]);
});

test('un ciclo en los imports del motor no se recorre sin fin', function () {
    writeManifest([
        'resources/js/map/engine.ts' => ['file' => 'assets/engine-prueba.js', 'imports' => ['_a.js']],
        '_a.js' => ['file' => 'assets/a-prueba.js', 'imports' => ['resources/js/map/engine.ts', '_a.js']],
    ]);

    expect(MapPreload::engineModules())->toBe([
        asset('build/assets/engine-prueba.js'),
        asset('build/assets/a-prueba.js'),
    ]);
});

test('si Vite no puede resolver un módulo del motor, no lanza: no adelanta nada', function () {
    // El manifest de public/build existe y trae el motor, pero Vite usa otro
    // directorio de compilación: Vite::asset() lanza ViteException. Un <link>
    // de optimización no puede costar un 500.
    Vite::useBuildDirectory('otra-compilacion');

    expect(MapPreload::engineModules())->toBe([]);
});

test('con el servidor de Vite en marcha no adelanta el motor', function () {
    $hot = tempnam(sys_get_temp_dir(), 'veni-hot-');
    Vite::useHotFile($hot);

    try {
        expect(Vite::isRunningHot())->toBeTrue()
            ->and(MapPreload::engineModules())->toBe([]);
    } finally {
        File::delete($hot);
    }
});
