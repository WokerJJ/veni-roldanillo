<?php

use App\Enums\LegalDocument;
use App\Models\Restaurant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Arr;
use Inertia\Testing\AssertableInertia as Assert;

/*
| Los documentos legales (#23, ADR 0030): /privacy, /terms y /reviews-policy.
| Públicos, en los dos idiomas, con versión y fecha, el aviso de borrador que
| se apaga con config y el texto desde lang/{idioma}/documents.php.
*/

// El reclamo crea un restaurante: cada prueba en su transacción.
uses(RefreshDatabase::class);

dataset('legal documents', [
    'datos personales' => ['/privacy', LegalDocument::Privacy],
    'términos' => ['/terms', LegalDocument::Terms],
    'reseñas' => ['/reviews-policy', LegalDocument::Reviews],
]);

/** Los textos del aviso plegable de los formularios de reclamo y retiro. */
function legalFormNotice(string $locale): array
{
    return array_map(
        fn (string $key): string => trans("requests.{$key}", [], $locale),
        ['privacy_summary', 'privacy_controller', 'privacy_body', 'privacy_policy_link', 'privacy_contact', 'privacy_version', 'privacy_accept'],
    );
}

/** Todas las cadenas de un documento ya armado (título, intro y secciones). */
function legalPageText(array $document): string
{
    return implode("\n", array_filter(Arr::flatten($document), 'is_string'));
}

test('cada documento es una página pública con su versión y su fecha', function (string $path, LegalDocument $document) {
    $this->withoutVite();

    $this->get($path)
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('Legal')
            ->where('document.key', $document->value)
            ->where('document.version', $document->version())
            ->where('document.effective_date', $document->effectiveDate()->toDateString())
            ->where('document.title', __("{$document->langKey()}.title"))
            ->has('document.sections.0.blocks.0')
            ->where('meta.title', __("{$document->langKey()}.title"))
            ->where('meta.description', __("{$document->langKey()}.description"))
            ->has('related', 2));
})->with('legal documents');

test('cada documento está en los dos idiomas', function (string $path, LegalDocument $document, string $locale, string $date) {
    $this->withoutVite();

    $response = $this->get("{$path}?lang={$locale}")->assertOk();

    $response->assertInertia(fn (Assert $page) => $page
        ->where('locale', $locale)
        ->where('document.title', trans("{$document->langKey()}.title", locale: $locale))
        ->where('document.effective_date_label', $date));

    // El título y la descripción van en el HTML de la primera carga (SEO).
    $response->assertSee('<title>'.e(trans("{$document->langKey()}.title", locale: $locale)).' · ', false)
        ->assertSee('<meta name="description" content="'.e(trans("{$document->langKey()}.description", locale: $locale)).'">', false);
})->with('legal documents')->with([
    'español' => ['es', '29 de octubre de 2026'],
    'inglés' => ['en', 'October 29, 2026'],
]);

test('el aviso de borrador se muestra hasta que la config lo apaga', function () {
    $this->withoutVite();

    $this->get('/privacy')->assertInertia(fn (Assert $page) => $page->where('draft', true));

    config(['legal.draft_notice' => false]);

    $this->get('/privacy')->assertInertia(fn (Assert $page) => $page->where('draft', false));
});

test('la política nombra al responsable y el correo de config, sin marcadores sueltos', function (string $locale) {
    $this->withoutVite();
    config(['privacy.contact_email' => 'privacidad@example.test']);

    $this->get("/privacy?lang={$locale}")->assertInertia(function (Assert $page) {
        $text = legalPageText($page->toArray()['props']['document']);

        expect($text)->toContain('Vení Roldanillo')
            ->toContain('privacidad@example.test')
            ->toContain('1581')
            ->not->toContain(':email')
            ->not->toContain(':controller');

        $page->where('contactEmail', 'privacidad@example.test');
    });
})->with(['es', 'en']);

test('la política dice los plazos de la Ley 1581 y los datos que se quedan en el teléfono', function () {
    $this->withoutVite();

    $this->get('/privacy')->assertInertia(function (Assert $page) {
        $text = legalPageText($page->toArray()['props']['document']);

        expect($text)->toContain('10 días hábiles')
            ->toContain('15 días hábiles')
            ->toContain('seis meses')
            ->toContain('Meta')
            ->toContain('no se guarda')
            ->toContain('No usamos cookies de seguimiento');
    });
});

test('las secciones tienen anclas únicas y los otros documentos se enlazan', function (string $path, LegalDocument $document) {
    $this->withoutVite();

    $this->get($path)->assertInertia(function (Assert $page) use ($document) {
        $props = $page->toArray()['props'];
        $ids = array_column($props['document']['sections'], 'id');

        expect($ids)->toBe(array_unique($ids))
            ->each->toMatch('/^[a-z]+(?:-[a-z]+)*$/');

        $others = array_values(array_filter(LegalDocument::cases(), fn (LegalDocument $other): bool => $other !== $document));
        expect(array_column($props['related'], 'href'))
            ->toBe(array_map(fn (LegalDocument $other): string => route($other->routeName(), absolute: false), $others));
    });
})->with('legal documents');

test('los textos de los documentos tienen las mismas claves y marcadores en los dos idiomas', function () {
    $es = Arr::dot(require lang_path('es/documents.php'));
    $en = Arr::dot(require lang_path('en/documents.php'));

    expect(array_keys($en))->toBe(array_keys($es));

    foreach ($es as $key => $line) {
        preg_match_all('/:([a-z]+)/', (string) $line, $esMarkers);
        preg_match_all('/:([a-z]+)/', (string) $en[$key], $enMarkers);

        expect($enMarkers[1])->toBe($esMarkers[1], "documents.{$key} no usa los mismos marcadores");
        expect(trim((string) $en[$key]))->not->toBe('', "documents.{$key} está vacío en inglés");
    }

    // Solo los marcadores que pone el controlador.
    preg_match_all('/:([a-z]+)/', implode("\n", array_map('strval', $es)), $markers);
    expect(array_values(array_unique($markers[1])))->each->toBeIn(['controller', 'email', 'holder', 'address', 'phone']);
});

test('cada versión publicada fija su texto: cambiarlo exige subir la versión', function (LegalDocument $document) {
    // tests/fixtures/legal-hashes.php guarda, por documento, la huella del
    // texto (español e inglés) de cada versión. Lo que aceptó cada persona
    // es «la versión X»: si el texto cambia y la versión no, ese registro
    // deja de decir qué leyó.
    /** @var array<string, array<string, string>> $hashes */
    $hashes = require base_path('tests/fixtures/legal-hashes.php');
    $text = json_encode([
        trans($document->langKey(), [], 'es'),
        trans($document->langKey(), [], 'en'),
        // El resumen de los formularios es parte del aviso de la política.
        ...($document === LegalDocument::Privacy ? [legalFormNotice('es'), legalFormNotice('en')] : []),
    ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $version = $document->version();

    expect($hashes[$document->value] ?? [])->toHaveKey($version, message: "{$document->value} {$version} no tiene huella en tests/fixtures/legal-hashes.php");
    expect(hash('sha256', $text))->toBe($hashes[$document->value][$version], "El texto de {$document->value} cambió sin cambiar su versión: subí la versión y la fecha en App\Enums\LegalDocument y agregá la huella nueva a tests/fixtures/legal-hashes.php.");
})->with(LegalDocument::cases());

test('el aviso de los formularios nombra todas las finalidades de la política (#23)', function (string $locale, string $account) {
    // Si se aprueba el reclamo, con ese nombre y ese correo se crea la cuenta
    // del dueño: es una finalidad y la casilla la tiene que decir.
    expect(trans('requests.privacy_accept', [], $locale))->toContain($account);

    $this->withoutVite();
    $this->get("/privacy?lang={$locale}")->assertInertia(function (Assert $page) use ($account) {
        expect(legalPageText($page->toArray()['props']['document']))->toContain($account);
    });
})->with([
    ['es', 'cuenta de dueño con ese nombre'],
    ['en', 'owner account with that name'],
]);

test('el formulario de reclamo enlaza la política con la versión que acepta', function () {
    $this->withoutVite();
    $restaurant = Restaurant::factory()->create(['slug' => 'la-ceiba']);

    $this->get("/restaurants/{$restaurant->slug}/claim")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('privacy.policy_url', '/privacy')
            ->where('privacy.version', LegalDocument::PRIVACY_VERSION));
});
