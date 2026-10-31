<?php

use App\Http\Controllers\DishGuideController;
use Illuminate\Support\Arr;
use Inertia\Testing\AssertableInertia as Assert;

/*
| La guía de platos típicos (#21): /dishes. Pública, en los dos idiomas, con
| el texto desde lang/{idioma}/guide.php (como los documentos legales, ADR
| 0030). La página y sus enlaces de búsqueda los prueba
| resources/js/pages/DishGuide.test.ts.
*/

test('la guía es una página pública en los dos idiomas, con su título y su descripción', function (string $locale) {
    $this->withoutVite();

    $title = trans('guide.title', [], $locale);
    $description = trans('guide.description', [], $locale);

    $this->get("/dishes?lang={$locale}")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('DishGuide')
            ->where('locale', $locale)
            ->where('guide.title', $title)
            ->where('guide.labels.search_link', trans('guide.search_link', [], $locale))
            ->has('guide.sections', 3)
            ->where('meta.title', $title)
            ->where('meta.description', $description))
        // El título y la descripción van en el HTML de la primera carga (SEO).
        ->assertSee('<title>'.e($title).' · ', false)
        ->assertSee('<meta name="description" content="'.e($description).'">', false);
})->with(['es', 'en']);

test('la guía tiene entre 10 y 15 platos, con anclas únicas y todos sus textos', function () {
    $this->withoutVite();

    $this->get('/dishes')->assertInertia(function (Assert $page) {
        $sections = $page->toArray()['props']['guide']['sections'];
        $dishes = array_merge(...array_column($sections, 'dishes'));
        $ids = [...array_column($sections, 'id'), ...array_column($dishes, 'id')];

        expect(count($dishes))->toBeGreaterThanOrEqual(10)->toBeLessThanOrEqual(15)
            ->and($ids)->toBe(array_unique($ids))
            ->each->toMatch('/^[a-z]+(?:-[a-z]+)*$/');

        foreach ($dishes as $dish) {
            expect($dish)->toHaveKeys(['id', 'name', 'search', 'summary', 'when', 'tip']);
        }
    });
});

test('los textos de la guía tienen las mismas claves en los dos idiomas, sin vacíos', function () {
    $es = Arr::dot(require lang_path('es/'.DishGuideController::TEXT.'.php'));
    $en = Arr::dot(require lang_path('en/'.DishGuideController::TEXT.'.php'));

    expect(array_keys($en))->toBe(array_keys($es));

    foreach ($es as $key => $line) {
        expect(trim((string) $line))->not->toBe('', "guide.{$key} está vacío en español")
            ->and(trim((string) $en[$key]))->not->toBe('', "guide.{$key} está vacío en inglés");

        // Lo que se busca en el inicio va en español en los dos idiomas: los
        // menús de los restaurantes están en español.
        if (str_ends_with($key, '.search')) {
            expect($en[$key])->toBe($line, "guide.{$key} no busca lo mismo en inglés");
        }
    }
});
