<?php

use Illuminate\Support\Facades\File;

/*
| Plantilla raíz de Inertia (resources/views/app.blade.php).
|
| El enlace «Saltar al contenido» y su destino (#contenido) los pinta Vue en
| el navegador (AppLayout.vue); sin SSR no aparecen en este HTML.
*/

beforeEach(function () {
    // Manifest de Vite propio en un public temporal: la prueba ejercita
    // @vite sin withoutVite() y sin depender de `npm run build`.
    $this->publicPath = sys_get_temp_dir().'/veni-root-view-'.bin2hex(random_bytes(4));
    File::ensureDirectoryExists($this->publicPath.'/build');
    File::put($this->publicPath.'/build/manifest.json', (string) json_encode([
        'resources/js/app.ts' => [
            'file' => 'assets/app-prueba.js',
            'src' => 'resources/js/app.ts',
            'isEntry' => true,
            'css' => ['assets/app-prueba.css'],
        ],
        'resources/js/pages/Home.vue' => [
            'file' => 'assets/Home-prueba.js',
            'src' => 'resources/js/pages/Home.vue',
            'isDynamicEntry' => true,
            // El mapa: la página lo pide con import() al montarse.
            'dynamicImports' => ['resources/js/map/engine.ts'],
        ],
        'resources/js/map/engine.ts' => [
            'file' => 'assets/engine-prueba.js',
            'src' => 'resources/js/map/engine.ts',
            'isDynamicEntry' => true,
            'css' => ['assets/engine-prueba.css'],
        ],
    ]));
    $this->app->usePublicPath($this->publicPath);
});

afterEach(function () {
    File::deleteDirectory($this->publicPath);
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

test('carga la entrada compilada y la página desde el manifest', function () {
    $this->get('/')
        ->assertOk()
        ->assertSee('build/assets/app-prueba.js', false)
        ->assertSee('build/assets/app-prueba.css', false)
        ->assertSee('build/assets/Home-prueba.js', false);
});

test('no carga ni precarga el mapa: MapLibre solo baja en las pantallas que lo pintan', function () {
    // ADR 0007. Quien visita una página sin mapa no debe descargar su código
    // ni su CSS; en las que lo tienen, lo pide el componente al montarse.
    $this->get('/')
        ->assertOk()
        ->assertSee('build/assets/Home-prueba.js', false)
        ->assertDontSee('engine-prueba', false);
});
