<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * Plantilla raíz de Inertia (resources/views/app.blade.php).
 *
 * El enlace «Saltar al contenido» y su destino (#contenido) los pinta Vue en
 * el navegador (AppLayout.vue); sin SSR no aparecen en este HTML.
 */
class RootViewTest extends TestCase
{
    private string $publicPath;

    protected function setUp(): void
    {
        parent::setUp();

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
            ],
        ]));
        $this->app->usePublicPath($this->publicPath);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->publicPath);

        parent::tearDown();
    }

    public function test_root_view_declares_spanish_as_the_document_language(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('<html lang="es"', false);
    }

    public function test_root_view_applies_the_saved_theme_before_painting(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee("localStorage.getItem('veni:theme')", false)
            ->assertSee('document.documentElement.dataset.theme = theme', false);
    }

    public function test_theme_storage_key_matches_the_frontend_composable(): void
    {
        $composable = File::get(resource_path('js/composables/useTheme.ts'));

        $this->assertStringContainsString("THEME_STORAGE_KEY = 'veni:theme'", $composable);
    }

    public function test_root_view_preloads_the_self_hosted_fonts(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('<link rel="preload" href="/fonts/figtree-latin-400-700.woff2" as="font" type="font/woff2" crossorigin>', false)
            ->assertSee('<link rel="preload" href="/fonts/bricolage-grotesque-latin-700-800.woff2" as="font" type="font/woff2" crossorigin>', false);
    }

    public function test_root_view_loads_the_compiled_entry_and_page_from_the_manifest(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertSee('build/assets/app-prueba.js', false)
            ->assertSee('build/assets/app-prueba.css', false)
            ->assertSee('build/assets/Home-prueba.js', false);
    }
}
