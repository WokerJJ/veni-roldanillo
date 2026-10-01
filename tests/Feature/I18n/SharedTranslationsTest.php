<?php

use Illuminate\Support\Facades\File;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/*
| Las traducciones de lang/{idioma}.json viajan a Vue como props compartidas
| de Inertia (ADR 0010). Son una prop «once»: el cliente las recuerda entre
| visitas y el servidor solo las reenvía cuando cambia el idioma.
*/

beforeEach(function () {
    $this->withoutVite();
});

/** @return array<string, string> */
function translationsFile(string $locale): array
{
    /** @var array<string, string> */
    return File::json(lang_path("{$locale}.json"));
}

/**
 * Visita de Inertia (XHR) desde una página ya cargada.
 *
 * @param  array<string, string>  $headers
 */
function inertiaVisit(TestCase $test, string $version, array $headers = []): TestResponse
{
    return $test->withHeaders([
        'X-Inertia' => 'true',
        'X-Inertia-Version' => $version,
        ...$headers,
    ])->get('/');
}

test('comparte el idioma y sus traducciones con Vue', function (?string $cookie, string $locale) {
    if ($cookie !== null) {
        $this->withUnencryptedCookie('locale', $cookie);
    }

    $response = $this->get('/')->assertOk();

    expect($response->inertiaProps('locale'))->toBe($locale)
        ->and($response->inertiaProps('translations'))->toBe(translationsFile($locale));
})->with([
    'español por defecto' => [null, 'es'],
    'inglés por la cookie' => ['en', 'en'],
]);

test('las traducciones son una prop once con el idioma en la clave', function () {
    // inertiaPage() no expone onceProps: se lee la página que recibe la vista.
    $page = $this->get('/')->viewData('page');

    expect($page['onceProps'] ?? [])->toHaveKey('translations:es')
        ->and($page['onceProps']['translations:es']['prop'])->toBe('translations');
});

test('no reenvía las traducciones que el cliente ya tiene', function () {
    $version = (string) $this->get('/')->inertiaPage()['version'];

    $response = inertiaVisit($this, $version, ['X-Inertia-Except-Once-Props' => 'translations:es'])
        ->assertOk();

    expect($response->json('props'))->toHaveKey('locale')
        ->not->toHaveKey('translations');
});

test('reenvía las traducciones cuando cambia el idioma', function () {
    $version = (string) $this->get('/')->inertiaPage()['version'];

    // El cliente tiene las de español; la cookie ya dice inglés.
    $this->withUnencryptedCookie('locale', 'en');
    $response = inertiaVisit($this, $version, ['X-Inertia-Except-Once-Props' => 'translations:es'])
        ->assertOk();

    expect($response->json('props.locale'))->toBe('en')
        ->and($response->json('props')['translations'] ?? null)->toBe(translationsFile('en'));
});
