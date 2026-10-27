<?php

use App\Enums\RestaurantRole;
use App\Filament\Owner\Resources\Dishes\Pages\EditDish;
use App\Filament\Owner\Resources\Dishes\RelationManagers\OptionGroupsRelationManager;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Restaurant;
use App\Models\User;
use Filament\Facades\Filament;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Livewire\Features\SupportTesting\Testable;
use Livewire\Livewire;
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
        // La página sin conexión (#5): su script, su estilo y los logos.
        'resources/js/offline.ts' => [
            'file' => 'assets/offline-prueba.js',
            'src' => 'resources/js/offline.ts',
            'isEntry' => true,
        ],
        'resources/css/offline.css' => [
            'file' => 'assets/offline-prueba.css',
            'src' => 'resources/css/offline.css',
            'isEntry' => true,
        ],
        'brand/logo/veni-wordmark.svg' => [
            'file' => 'assets/veni-wordmark-prueba.svg',
            'src' => 'brand/logo/veni-wordmark.svg',
        ],
        'brand/logo/veni-wordmark-blanco.svg' => [
            'file' => 'assets/veni-wordmark-blanco-prueba.svg',
            'src' => 'brand/logo/veni-wordmark-blanco.svg',
        ],
    ]));

    app()->usePublicPath($publicPath);

    return $publicPath;
}

/*
| Panel del dueño (#18, ADR 0025): ayudas de las pruebas de tests/Feature/Panel.
*/

function panelMember(Restaurant $restaurant, RestaurantRole $role = RestaurantRole::Owner): User
{
    $user = User::factory()->create();
    $restaurant->members()->attach($user, ['role' => $role->value]);

    return $user;
}

/** Entra al panel como $user, con $restaurant como el de la dirección. */
function actInPanel(User $user, Restaurant $restaurant): void
{
    test()->actingAs($user);
    Filament::setCurrentPanel(Filament::getPanel('owner'));
    Filament::setTenant($restaurant);
    Filament::bootCurrentPanel();
}

/**
 * Un plato con su sección, del restaurante dado.
 *
 * @param  array<string, mixed>  $attributes
 */
function panelDish(Restaurant $restaurant, array $attributes = []): Dish
{
    $section = MenuSection::factory()->for($restaurant)->create();

    return Dish::factory()->for($restaurant)->create(['menu_section_id' => $section->id, ...$attributes]);
}

/** Los grupos de opciones de un plato, como se ven al editarlo. */
function groupManager(Dish $dish): Testable
{
    return Livewire::test(OptionGroupsRelationManager::class, ['ownerRecord' => $dish, 'pageClass' => EditDish::class]);
}
