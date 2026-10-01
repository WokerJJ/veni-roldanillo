<?php

use App\Enums\Locale;
use App\Models\Category;
use App\Models\Concerns\HasTranslatableFields;
use App\Models\DailyMenu;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\Option;
use App\Models\OptionGroup;
use App\Models\Promotion;
use App\Models\Restaurant;
use App\Models\SpecialHour;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

/*
| Campos de contenido con versión _es y _en (ADR 0009 y 0010): translated()
| devuelve el del idioma actual y, si falta el inglés, el español.
*/

uses(RefreshDatabase::class);

test('devuelve el campo en el idioma de la petición', function () {
    $category = new Category(['name_es' => 'Comida típica', 'name_en' => 'Traditional food']);

    App::setLocale('es');
    expect($category->translated('name'))->toBe('Comida típica');

    App::setLocale('en');
    expect($category->translated('name'))->toBe('Traditional food');
});

test('si falta el inglés devuelve el español', function (?string $english) {
    $dish = new Dish(['name_es' => 'Sancocho de gallina', 'name_en' => $english]);

    App::setLocale('en');

    expect($dish->translated('name'))->toBe('Sancocho de gallina');
})->with([
    'nulo' => [null],
    'vacío' => [''],
    'solo espacios' => ['   '],
]);

test('acepta un idioma explícito sin cambiar el de la petición', function () {
    $promotion = new Promotion(['title_es' => 'Dos por uno', 'title_en' => 'Two for one']);

    App::setLocale('es');

    expect($promotion->translated('title', Locale::En))->toBe('Two for one')
        ->and($promotion->translated('title'))->toBe('Dos por uno')
        ->and(App::getLocale())->toBe('es');
});

test('sin texto en ningún idioma devuelve null', function () {
    $restaurant = new Restaurant(['description_es' => null, 'description_en' => null]);

    App::setLocale('en');

    expect($restaurant->translated('description'))->toBeNull();
});

test('pedir un campo no declarado lanza una excepción', function () {
    $restaurant = new Restaurant(['name' => 'La Fonda (ficticio)']);

    // name existe, pero es un nombre propio sin versión por idioma.
    expect(fn () => $restaurant->translated('name'))
        ->toThrow(InvalidArgumentException::class, 'name');
});

test('cada campo traducible declarado tiene sus columnas _es y _en', function (string $class, array $fields) {
    /** @var Model $model */
    $model = new $class;

    expect($model->translatableFields())->toBe($fields);

    foreach ($fields as $field) {
        expect(Schema::hasColumns($model->getTable(), ["{$field}_es", "{$field}_en"]))
            ->toBeTrue("{$class}: faltan las columnas de «{$field}»");
    }
})->with([
    [Category::class, ['name']],
    [DailyMenu::class, ['description']],
    [Dish::class, ['name', 'description']],
    [MenuSection::class, ['name']],
    [Option::class, ['name']],
    [OptionGroup::class, ['name']],
    [Promotion::class, ['title']],
    [Restaurant::class, ['description', 'delivery_notes']],
    [SpecialHour::class, ['note']],
]);

test('ningún modelo con columnas _es y _en queda sin declarar el campo', function () {
    $checked = 0;

    foreach (File::files(app_path('Models')) as $file) {
        $class = 'App\\Models\\'.$file->getFilenameWithoutExtension();
        $model = new $class;

        if (! $model instanceof Model) {
            continue;
        }

        $columns = Schema::getColumnListing($model->getTable());
        $fields = collect($columns)
            ->filter(fn (string $column) => str_ends_with($column, '_en') && in_array(substr($column, 0, -3).'_es', $columns, true))
            ->map(fn (string $column) => substr($column, 0, -3))
            ->values()
            ->all();

        if ($fields === []) {
            continue;
        }

        expect(class_uses_recursive($model))->toHaveKey(HasTranslatableFields::class, message: "{$class} no usa HasTranslatableFields");
        expect($model->translatableFields())->toEqualCanonicalizing($fields, "{$class} no declara todos sus campos traducibles");
        $checked++;
    }

    // Si el recorrido dejara de encontrar modelos, la prueba pasaría sin probar nada.
    expect($checked)->toBeGreaterThan(0);
});
