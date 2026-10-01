<?php

use Illuminate\Support\Facades\File;
use Symfony\Component\Finder\Finder;

/*
| Los textos de la interfaz viven en lang/es.json y lang/en.json (ADR 0010).
| Estas pruebas hacen que CI falle si un idioma tiene una clave que el otro
| no tiene, si cambian los marcadores (:year) entre idiomas o si el código usa
| una clave que no existe.
*/

const LOCALES = ['es', 'en'];

/** @return array<array-key, mixed> */
function langLines(string $locale): array
{
    $lines = json_decode(File::get(lang_path("{$locale}.json")), true, flags: JSON_THROW_ON_ERROR);

    return is_array($lines) ? $lines : [];
}

/**
 * Marcadores de un texto, sin distinguir :year, :Year y :YEAR.
 *
 * @return list<string>
 */
function placeholdersIn(string $line): array
{
    preg_match_all('/:([A-Za-z_][A-Za-z0-9_]*)/', $line, $matches);
    $names = array_unique(array_map(strtolower(...), $matches[1]));
    sort($names);

    return $names;
}

/**
 * Claves literales en llamadas a __(), trans(), trans_choice(), @lang() y t().
 * No cuenta métodos con el mismo nombre ($x->t(), obj.t(), $t()).
 *
 * @return list<string>
 */
function translationKeysIn(string $source): array
{
    preg_match_all(
        '/(?<![\w$.>:])(?:__|trans_choice|trans|@lang|t)\(\s*([\'"])(.+?)(?<!\\\\)\1/',
        $source,
        $matches,
    );

    return array_values(array_unique($matches[2]));
}

/** @return list<string> */
function translationKeysUsedInCode(): array
{
    $files = Finder::create()
        ->files()
        ->in([app_path(), resource_path()])
        ->name(['*.php', '*.ts', '*.vue'])
        // Las pruebas y sus dobles usan claves inventadas a propósito.
        ->notName('*.test.ts')
        ->notPath('js/testing');

    $keys = [];

    foreach ($files as $file) {
        array_push($keys, ...translationKeysIn($file->getContents()));
    }

    $keys = array_values(array_unique($keys));
    sort($keys);

    return $keys;
}

test('lang/es.json y lang/en.json tienen exactamente las mismas claves', function () {
    $es = array_keys(langLines('es'));
    $en = array_keys(langLines('en'));

    expect(array_values(array_diff($es, $en)))->toBe([], 'Claves que faltan en lang/en.json')
        ->and(array_values(array_diff($en, $es)))->toBe([], 'Claves que faltan en lang/es.json');
});

test('cada texto es una cadena no vacía', function (string $locale) {
    $lines = langLines($locale);

    expect($lines)->not->toBeEmpty();

    foreach ($lines as $key => $line) {
        expect($line)->toBeString("{$locale}.json: «{$key}» no es texto")
            ->and(trim((string) $line))->not->toBe('', "{$locale}.json: «{$key}» está vacía");
    }
})->with(LOCALES);

test('los dos idiomas usan los mismos marcadores', function () {
    $en = langLines('en');

    foreach (langLines('es') as $key => $line) {
        expect(placeholdersIn((string) ($en[$key] ?? '')))
            ->toBe(placeholdersIn((string) $line), "Marcadores distintos en «{$key}»");
    }
});

test('el buscador de claves reconoce las llamadas de PHP, Blade y Vue', function () {
    $source = <<<'SRC'
        {{ __('meta.description') }} @lang('layout.footer') trans("home.title")
        trans_choice('home.items', 2) :alt="t('home.logo_alt')" t( 'home.heading', { year })
        $page->t('no.metodo') i18n.t('no.objeto') $t('no.global') get('no.otra') parse('no.otra')
        SRC;

    expect(translationKeysIn($source))->toBe([
        'meta.description', 'layout.footer', 'home.title', 'home.items', 'home.logo_alt', 'home.heading',
    ]);
});

test('toda clave usada en el código existe en los archivos de idioma', function () {
    $used = translationKeysUsedInCode();

    // Si el buscador dejara de encontrar claves, la prueba pasaría sin probar nada.
    expect($used)->toContain('meta.description', 'layout.skip_to_content', 'home.title');

    expect(array_values(array_diff($used, array_keys(langLines('es')))))
        ->toBe([], 'Claves usadas en el código que no están en lang/es.json ni lang/en.json');
});
