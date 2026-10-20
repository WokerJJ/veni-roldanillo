<?php

use Inertia\Testing\AssertableInertia as Assert;

/*
| /credits (#58, ADR 0021): la atribución a OpenStreetMap es pública, sin
| sesión. El texto vive en lang/ y lo prueba resources/js/pages/Credits.test.ts.
*/

test('los créditos son una página pública', function () {
    $this->withoutVite();

    $this->get('/credits')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('Credits'));
});

test('los créditos están en los dos idiomas', function (string $locale) {
    $translations = json_decode((string) file_get_contents(lang_path("{$locale}.json")), true, flags: JSON_THROW_ON_ERROR);

    expect($translations['credits.osm_attribution'])->toContain('OpenStreetMap')
        ->and($translations['credits.osm_license'])->toContain('ODbL');
})->with(['es', 'en']);
