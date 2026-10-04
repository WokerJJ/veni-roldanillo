<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/*
| Las pruebas de Feature arrancan la aplicación de Laravel (Tests\TestCase);
| las de Unit no la necesitan y corren sobre el TestCase de PHPUnit.
*/

pest()->extend(TestCase::class)
    ->afterEach(function () {
        // Una prueba con APP_ENV=production hace que TrustHosts fije los hosts
        // de confianza, que son estado global de Symfony: no pasan a la
        // siguiente prueba.
        Request::setTrustedHosts([]);

        // El public temporal de fakeViteManifest(), si la prueba lo usó.
        $publicPath = $this->app->publicPath();

        if (str_starts_with($publicPath, fakeViteManifestPrefix())) {
            File::deleteDirectory($publicPath);
        }
    })
    ->in('Feature');

function fakeViteManifestPrefix(): string
{
    return sys_get_temp_dir().'/veni-vite-';
}

/**
 * Manifest de Vite propio en un public temporal, que se borra al terminar la
 * prueba: las etiquetas de @vite salen de verdad, sin withoutVite() y sin
 * depender de `npm run build` (en CI public/build no existe). La entrada
 * importa un chunk compartido; la página Home pide el mapa con import() al
 * montarse, y el mapa trae su CSS.
 *
 * @return string La carpeta public temporal.
 */
function fakeViteManifest(): string
{
    $publicPath = fakeViteManifestPrefix().bin2hex(random_bytes(4));

    File::ensureDirectoryExists($publicPath.'/build');
    File::put($publicPath.'/build/manifest.json', (string) json_encode([
        'resources/js/app.ts' => [
            'file' => 'assets/app-prueba.js',
            'src' => 'resources/js/app.ts',
            'isEntry' => true,
            'css' => ['assets/app-prueba.css'],
            'imports' => ['_compartido-prueba.js'],
        ],
        '_compartido-prueba.js' => [
            'file' => 'assets/compartido-prueba.js',
        ],
        'resources/js/pages/Home.vue' => [
            'file' => 'assets/Home-prueba.js',
            'src' => 'resources/js/pages/Home.vue',
            'isDynamicEntry' => true,
            'dynamicImports' => ['resources/js/map/engine.ts'],
        ],
        'resources/js/map/engine.ts' => [
            'file' => 'assets/engine-prueba.js',
            'src' => 'resources/js/map/engine.ts',
            'isDynamicEntry' => true,
            'css' => ['assets/engine-prueba.css'],
        ],
    ]));

    app()->usePublicPath($publicPath);

    return $publicPath;
}
