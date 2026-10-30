<?php

use App\Enums\Locale;
use App\Enums\OptionGroupKind;
use App\Enums\PaymentMethod;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\File;
use Symfony\Component\Finder\Finder;

/*
| Los textos de la interfaz viven en lang/{idioma}.json, un archivo por cada
| idioma de App\Enums\Locale (ADR 0010). Estas pruebas hacen que CI falle si un
| idioma tiene una clave que otro no tiene, si cambian los marcadores (:year)
| entre idiomas o si el código usa una clave que no existe. Un idioma nuevo en
| el enum entra solo en todas ellas.
|
| Los helpers de un archivo de prueba son funciones globales: llevan el nombre
| del archivo como prefijo para no chocar con los de otro.
*/

/**
 * Idiomas de la interfaz, como texto (para los nombres de los datasets).
 *
 * @return list<string>
 */
function langFilesLocales(): array
{
    return array_column(Locale::cases(), 'value');
}

/** @return array<array-key, mixed> */
function langFilesLines(string $locale): array
{
    $lines = json_decode(File::get(lang_path("{$locale}.json")), true, flags: JSON_THROW_ON_ERROR);

    return is_array($lines) ? $lines : [];
}

/**
 * Marcadores de un texto, sin distinguir :year, :Year y :YEAR.
 *
 * @return list<string>
 */
function langFilesPlaceholdersIn(string $line): array
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
function langFilesKeysIn(string $source): array
{
    preg_match_all(
        '/(?<![\w$.>:])(?:__|trans_choice|trans|@lang|t)\(\s*([\'"])(.+?)(?<!\\\\)\1/',
        $source,
        $matches,
    );

    return array_values(array_unique($matches[2]));
}

/** @return list<string> */
function langFilesKeysUsedInCode(): array
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
        array_push($keys, ...langFilesKeysIn($file->getContents()));
    }

    // Los textos del panel del dueño van en lang/{idioma}/panel.php, solo del
    // servidor (ADR 0025); los revisa su propia prueba, abajo. Los documentos
    // legales, en lang/{idioma}/documents.php (ADR 0030), los revisan
    // LegalPagesTest y LegalReadinessTest. Las claves con
    // «::» son de un paquete (las vistas de Filament copiadas en
    // resources/views/vendor) y las trae el paquete.
    $keys = array_values(array_unique(array_filter($keys, fn (string $key): bool => ! str_starts_with($key, 'panel.') && ! str_starts_with($key, 'documents.') && ! str_contains($key, '::'))));
    sort($keys);

    return $keys;
}

test('hay más de un idioma que comparar', function () {
    // Con un solo idioma en el enum, las comparaciones de abajo pasarían sin comparar nada.
    expect(count(langFilesLocales()))->toBeGreaterThan(1);
});

test('el idioma tiene exactamente las mismas claves que el de origen', function (string $locale) {
    $source = array_keys(langFilesLines(Locale::DEFAULT->value));
    $keys = array_keys(langFilesLines($locale));

    expect(array_values(array_diff($source, $keys)))->toBe([], "Claves que faltan en lang/{$locale}.json")
        ->and(array_values(array_diff($keys, $source)))->toBe([], "Claves de lang/{$locale}.json que no están en el idioma de origen");
})->with(langFilesLocales());

test('cada texto es una cadena no vacía', function (string $locale) {
    $lines = langFilesLines($locale);

    expect($lines)->not->toBeEmpty();

    foreach ($lines as $key => $line) {
        expect($line)->toBeString("{$locale}.json: «{$key}» no es texto")
            ->and(trim((string) $line))->not->toBe('', "{$locale}.json: «{$key}» está vacía");
    }
})->with(langFilesLocales());

test('el idioma usa los mismos marcadores que el de origen', function (string $locale) {
    $lines = langFilesLines($locale);

    foreach (langFilesLines(Locale::DEFAULT->value) as $key => $line) {
        expect(langFilesPlaceholdersIn((string) ($lines[$key] ?? '')))
            ->toBe(langFilesPlaceholdersIn((string) $line), "Marcadores distintos en «{$key}» de lang/{$locale}.json");
    }
})->with(langFilesLocales());

test('el buscador de claves reconoce las llamadas de PHP, Blade y Vue', function () {
    $source = <<<'SRC'
        {{ __('meta.description') }} @lang('layout.footer') trans("home.title")
        trans_choice('home.items', 2) :alt="t('home.logo_alt')" t( 'home.heading', { year })
        $page->t('no.metodo') i18n.t('no.objeto') $t('no.global') get('no.otra') parse('no.otra')
        SRC;

    expect(langFilesKeysIn($source))->toBe([
        'meta.description', 'layout.footer', 'home.title', 'home.items', 'home.logo_alt', 'home.heading',
    ]);
});

test('toda clave usada en el código existe en los archivos de idioma', function () {
    $used = langFilesKeysUsedInCode();

    // Si el buscador dejara de encontrar claves, la prueba pasaría sin probar nada.
    expect($used)->toContain('meta.description', 'layout.skip_to_content', 'home.title');

    // Basta el idioma de origen: la prueba de paridad obliga a que estén en todos.
    expect(array_values(array_diff($used, array_keys(langFilesLines(Locale::DEFAULT->value)))))
        ->toBe([], 'Claves usadas en el código que no están en los archivos de idioma');
});

test('los textos del panel del dueño tienen las mismas claves en los dos idiomas y existen las que usa el código', function () {
    $flatten = fn (string $locale): array => array_keys(Arr::dot(require lang_path("{$locale}/panel.php")));
    $keys = $flatten(Locale::DEFAULT->value);

    foreach (langFilesLocales() as $locale) {
        expect($flatten($locale))->toBe($keys, "lang/{$locale}/panel.php no tiene las mismas claves");
    }

    $used = [];
    foreach (Finder::create()->files()->in(app_path())->name('*.php') as $file) {
        preg_match_all("/__\(['\"]panel\.([a-z_.]+[a-z])['\"]/", $file->getContents(), $matches);
        array_push($used, ...$matches[1]);
    }

    expect($used)->not->toBeEmpty()
        ->and(array_values(array_diff(array_unique($used), $keys)))->toBe([]);
});

test('existen las claves del panel que el código arma con un valor (medios de pago, tipos de grupo, días)', function () {
    $dynamic = [
        ...array_map(fn (PaymentMethod $method): string => "payment.{$method->value}", PaymentMethod::cases()),
        ...array_map(fn (OptionGroupKind $kind): string => "groups.kind_{$kind->value}", OptionGroupKind::cases()),
        ...array_map(fn (int $weekday): string => "weekdays.{$weekday}", range(0, 6)),
    ];

    foreach (langFilesLocales() as $locale) {
        $keys = array_keys(Arr::dot(require lang_path("{$locale}/panel.php")));

        expect(array_values(array_diff($dynamic, $keys)))->toBe([], "lang/{$locale}/panel.php no tiene todas las claves armadas con un valor");
    }
});
