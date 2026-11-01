<?php

use App\Enums\OptionGroupKind;
use App\Enums\RestaurantRole;
use App\Enums\RestaurantStatus;
use App\Filament\Owner\Pages\EditRestaurantProfile;
use App\Filament\Owner\Resources\Dishes\Pages\EditDish;
use App\Filament\Owner\Resources\Dishes\Pages\ListDishes;
use App\Filament\Owner\Resources\Dishes\RelationManagers\OptionGroupsRelationManager;
use App\Filament\Owner\Resources\MenuSections\Pages\CreateMenuSection;
use App\Filament\Owner\Resources\OpeningHours\Pages\CreateOpeningHour;
use App\Models\MenuSection;
use App\Models\OptionGroup;
use App\Models\Restaurant;
use App\Models\User;
use App\Support\BusinessDay;
use Filament\Auth\Pages\Login;
use Filament\Facades\Filament;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * Panel del dueño (#18, ADR 0025): quién entra, qué ve, qué guarda. Las
 * ayudas (panelMember, actInPanel, panelDish, groupManager) están en
 * tests/Pest.php.
 */
describe('acceso', function () {
    test('sin sesión, el panel manda al login', function () {
        $restaurant = Restaurant::factory()->claimed()->create();

        $this->get("/panel/{$restaurant->slug}/dishes")->assertRedirect('/panel/login');
    });

    test('no hay registro abierto ni recuperación de contraseña', function () {
        $panel = Filament::getPanel('owner');

        expect($panel->hasRegistration())->toBeFalse()
            ->and($panel->hasPasswordReset())->toBeFalse()
            ->and(Route::has('filament.owner.auth.register'))->toBeFalse()
            ->and(Route::has('filament.owner.auth.password-reset.request'))->toBeFalse();
    });

    test('el dueño entra a su restaurante', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);

        $this->actingAs($owner)->get("/panel/{$restaurant->slug}/dishes")->assertOk();
        $this->actingAs($owner)->get("/panel/{$restaurant->slug}/profile")->assertOk();
    });

    test('otro dueño no entra al restaurante ajeno: 404, como si no existiera', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        $other = panelMember(Restaurant::factory()->claimed()->create());

        $this->actingAs($other)->get("/panel/{$restaurant->slug}/dishes")->assertNotFound();
        $this->actingAs($other)->get("/panel/{$restaurant->slug}/profile")->assertNotFound();
        $this->actingAs($other)->get("/panel/{$restaurant->slug}/dishes/{$dish->id}/edit")->assertNotFound();
    });

    test('un dueño no abre un plato ajeno cambiando el id en la dirección de su restaurante (IDOR)', function () {
        $mine = Restaurant::factory()->claimed()->create();
        $owner = panelMember($mine);
        $foreign = panelDish(Restaurant::factory()->claimed()->create());

        $this->actingAs($owner)->get("/panel/{$mine->slug}/dishes/{$foreign->id}/edit")->assertNotFound();
    });

    test('un empleado no entra al panel', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $staff = panelMember($restaurant, RestaurantRole::Staff);

        $this->actingAs($staff)->get("/panel/{$restaurant->slug}/dishes")->assertForbidden();
    });

    test('una persona sin restaurante tampoco, ni el administrador (tendrá su panel, #19)', function () {
        $restaurant = Restaurant::factory()->claimed()->create();

        $this->actingAs(User::factory()->create())->get("/panel/{$restaurant->slug}/dishes")->assertForbidden();
        $this->actingAs(User::factory()->admin()->create())->get("/panel/{$restaurant->slug}/dishes")->assertForbidden();
    });

    test('la lista de platos muestra solo los del restaurante de la dirección', function () {
        $mine = Restaurant::factory()->claimed()->create();
        $owner = panelMember($mine);
        $own = panelDish($mine, ['name_es' => 'Mío']);
        $foreign = panelDish(Restaurant::factory()->claimed()->create(), ['name_es' => 'Ajeno']);
        actInPanel($owner, $mine);

        Livewire::test(ListDishes::class)
            ->assertCanSeeTableRecords([$own])
            ->assertCanNotSeeTableRecords([$foreign]);
    });

    test('el login limita los intentos: al sexto seguido, ni con la clave correcta', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);
        $owner->forceFill(['password' => 'clave-de-prueba'])->save();
        Filament::setCurrentPanel(Filament::getPanel('owner'));

        foreach (range(1, 5) as $attempt) {
            Livewire::test(Login::class)
                ->fillForm(['email' => $owner->email, 'password' => 'equivocada'])
                ->call('authenticate');
        }

        Livewire::test(Login::class)
            ->fillForm(['email' => $owner->email, 'password' => 'clave-de-prueba'])
            ->call('authenticate');

        $this->assertGuest();
    });
});

describe('la ficha', function () {
    test('el dueño guarda su ficha y se mueve «Actualizada el…»', function () {
        $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditRestaurantProfile::class)
            ->fillForm(['name' => '  Fonda de Prueba  ', 'description_es' => 'Sancocho los domingos.'])
            ->call('save')
            ->assertHasNoFormErrors();

        $restaurant->refresh();
        expect($restaurant->name)->toBe('Fonda de Prueba')
            ->and($restaurant->description_es)->toBe('Sancocho los domingos.')
            ->and($restaurant->updated_by_owner_at)->not->toBeNull();
    });

    test('el nombre no puede ser solo espacios, tampoco los de Unicode', function (string $name) {
        $restaurant = Restaurant::factory()->claimed()->create(['name' => 'Original']);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditRestaurantProfile::class)
            ->fillForm(['name' => $name])
            ->call('save')
            ->assertHasFormErrors(['name']);

        expect($restaurant->refresh()->name)->toBe('Original');
    })->with(['espacios' => '   ', 'espacio duro' => "\u{00A0}\u{00A0}", 'tabulador' => "\t"]);

    test('los espacios de Unicode a los lados también se recortan al guardar', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditRestaurantProfile::class)
            ->fillForm(['name' => "\u{00A0}Fonda de Prueba\u{2003}", 'description_es' => "\u{3000}Sancocho\u{00A0}\n"])
            ->call('save')
            ->assertHasNoFormErrors();

        $restaurant->refresh();
        expect($restaurant->name)->toBe('Fonda de Prueba')
            ->and($restaurant->description_es)->toBe('Sancocho');
    });

    test('la descripción tiene tope', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditRestaurantProfile::class)
            ->fillForm(['description_es' => str_repeat('a', EditRestaurantProfile::DESCRIPTION_MAX + 1)])
            ->call('save')
            ->assertHasFormErrors(['description_es']);
    });

    test('slug, estado, plan, verificación y «ficticio» no se cambian desde el panel', function () {
        $restaurant = Restaurant::factory()->claimed()->create(['slug' => 'la-original', 'is_fictitious' => false]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditRestaurantProfile::class)
            ->assertFormFieldDoesNotExist('slug')
            ->assertFormFieldDoesNotExist('status')
            ->assertFormFieldDoesNotExist('plan')
            ->assertFormFieldDoesNotExist('verified_at')
            ->assertFormFieldDoesNotExist('is_fictitious')
            ->set('data.slug', 'otra')
            ->set('data.status', 'hidden')
            ->set('data.plan', 'featured')
            ->set('data.is_fictitious', true)
            ->call('save');

        $restaurant->refresh();
        expect($restaurant->slug)->toBe('la-original')
            ->and($restaurant->status)->toBe(RestaurantStatus::Claimed)
            ->and($restaurant->is_fictitious)->toBeFalse();
    });

    test('el aviso de demora sale en la ficha pública y vence solo', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditRestaurantProfile::class)
            ->callAction('announceDelay', data: ['minutes' => 40])
            ->assertHasNoActionErrors();

        expect($restaurant->refresh()->activeDelayMinutes())->toBe(40);
        // Como en RestaurantPageTest: sin depender de los assets compilados.
        $this->withoutVite();
        $this->get("/restaurants/{$restaurant->slug}")
            ->assertInertia(fn ($page) => $page->where('restaurant.delay_minutes', 40));

        $this->travel(Restaurant::DELAY_NOTICE_HOURS)->hours();
        $this->travel(1)->minutes();
        expect($restaurant->refresh()->activeDelayMinutes())->toBeNull();
    });

    test('el aviso de demora solo acepta los minutos de la lista', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditRestaurantProfile::class)
            ->callAction('announceDelay', data: ['minutes' => 999])
            ->assertHasActionErrors(['minutes']);

        expect($restaurant->refresh()->delay_minutes)->toBeNull();
    });
});

describe('el menú', function () {
    test('editar un plato guarda el precio entero, «agotado hoy» y mueve «Actualizada el…»', function () {
        $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
        $dish = panelDish($restaurant, ['price' => 18000, 'sold_out_until' => null]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
            ->fillForm(['price' => 19500, 'sold_out_today' => true])
            ->call('save')
            ->assertHasNoFormErrors();

        $dish->refresh();
        expect($dish->price)->toBe(19500)
            ->and($dish->sold_out_until?->toDateString())->toBe(BusinessDay::today()->toDateString())
            ->and($restaurant->refresh()->updated_by_owner_at)->not->toBeNull();
    });

    test('el precio es un entero de pesos, sin decimales ni negativos', function (mixed $price) {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant, ['price' => 18000]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
            ->fillForm(['price' => $price])
            ->call('save')
            ->assertHasFormErrors(['price']);

        expect($dish->refresh()->price)->toBe(18000);
    })->with(['decimales' => '18000.5', 'negativo' => -1, 'texto' => 'mil']);

    test('un plato no se pasa a una sección de otro restaurante', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        $foreignSection = MenuSection::factory()->for(Restaurant::factory()->claimed())->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditDish::class, ['record' => $dish->getRouteKey()])
            ->fillForm(['menu_section_id' => $foreignSection->id])
            ->call('save')
            ->assertHasFormErrors(['menu_section_id']);
    });

    test('«Agotado hoy» desde la lista lo marca y lo quita', function () {
        $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
        $dish = panelDish($restaurant, ['sold_out_until' => null]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(ListDishes::class)
            ->assertTableActionHidden('backInStock', $dish)
            ->callTableAction('markSoldOut', $dish);
        expect($dish->refresh()->sold_out_until?->toDateString())->toBe(BusinessDay::today()->toDateString())
            ->and($restaurant->refresh()->updated_by_owner_at)->not->toBeNull();

        Livewire::test(ListDishes::class)
            ->assertTableActionHidden('markSoldOut', $dish)
            ->callTableAction('backInStock', $dish);
        expect($dish->refresh()->sold_out_until)->toBeNull();
    });

    test('marcar «Agotado hoy» desde dos listas abiertas lo deja agotado (BUG-014)', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant, ['sold_out_until' => null]);
        actInPanel(panelMember($restaurant), $restaurant);

        $first = Livewire::test(ListDishes::class);
        $second = Livewire::test(ListDishes::class);

        $first->callTableAction('markSoldOut', $dish);
        // La segunda lista, abierta antes, ya no ofrece «Agotado hoy»: el
        // servidor vuelve a mirar el registro y no lo ejecuta ni lo devuelve.
        $second->assertTableActionHidden('markSoldOut', $dish);

        expect($dish->refresh()->sold_out_until?->toDateString())->toBe(BusinessDay::today()->toDateString());
    });

    test('crear una sección la cuelga del restaurante de la dirección y mueve «Actualizada el…»', function () {
        $restaurant = Restaurant::factory()->claimed()->create(['updated_by_owner_at' => null]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(CreateMenuSection::class)
            ->fillForm(['name_es' => 'Bebidas', 'position' => 3])
            ->call('create')
            ->assertHasNoFormErrors();

        expect($restaurant->menuSections()->where('name_es', 'Bebidas')->exists())->toBeTrue()
            ->and($restaurant->refresh()->updated_by_owner_at)->not->toBeNull();
    });

    test('una franja que se pisa con otra del mismo día se avisa en el formulario, sin error 500', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $restaurant->openingHours()->create(['weekday' => 1, 'opens_at' => '11:00', 'closes_at' => '15:00']);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(CreateOpeningHour::class)
            ->fillForm(['weekday' => 1, 'opens_at' => '14:00', 'closes_at' => '18:00'])
            ->call('create')
            ->assertHasFormErrors(['opens_at']);

        expect($restaurant->openingHours()->count())->toBe(1);
    });
});

describe('los grupos de opciones (auditoría del #14)', function () {
    test('se crea un grupo de elegir con sus opciones; obligatorio si el mínimo es 1', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        actInPanel(panelMember($restaurant), $restaurant);

        groupManager($dish)
            ->callTableAction('create', data: [
                'kind' => 'choice', 'name_es' => 'Proteína', 'min_choices' => 1, 'max_choices' => 1, 'position' => 0,
                'options' => [
                    ['name_es' => 'Pollo', 'price_delta' => 0, 'available' => true],
                    ['name_es' => 'Res', 'price_delta' => 2000, 'available' => true],
                ],
            ])
            ->assertHasNoTableActionErrors();

        $group = $dish->optionGroups()->sole();
        expect($group->required)->toBeTrue()
            ->and($group->options()->count())->toBe(2);
    });

    test('un tipo que no es del enum responde con error y no guarda', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        actInPanel(panelMember($restaurant), $restaurant);

        groupManager($dish)
            ->callTableAction('create', data: [
                'kind' => 'otro', 'name_es' => 'Raro', 'min_choices' => 0, 'max_choices' => 1, 'position' => 0,
                'options' => [['name_es' => 'Algo', 'price_delta' => 0, 'available' => true]],
            ])
            ->assertHasTableActionErrors(['kind']);

        expect($dish->optionGroups()->count())->toBe(0);
    });

    test('pasar un grupo obligatorio a «quitar» responde con error y la fila no cambia', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        $group = $dish->optionGroups()->create([
            'kind' => OptionGroupKind::Choice, 'name_es' => 'Proteína', 'required' => true,
            'min_choices' => 1, 'max_choices' => 1, 'position' => 0,
        ]);
        $group->options()->create(['name_es' => 'Pollo', 'price_delta' => 0, 'position' => 0]);
        actInPanel(panelMember($restaurant), $restaurant);

        groupManager($dish)
            ->callTableAction('edit', $group, data: ['kind' => 'removal', 'min_choices' => 1])
            ->assertHasTableActionErrors(['min_choices']);

        $group->refresh();
        expect($group->kind)->toBe(OptionGroupKind::Choice)
            ->and($group->required)->toBeTrue();
    });

    test('hay un tope de grupos por plato', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        foreach (range(1, OptionGroupsRelationManager::MAX_GROUPS) as $i) {
            $dish->optionGroups()->create(['kind' => OptionGroupKind::Choice, 'name_es' => "G{$i}", 'required' => false, 'min_choices' => 0, 'max_choices' => 1, 'position' => $i]);
        }
        actInPanel(panelMember($restaurant), $restaurant);

        groupManager($dish)->assertTableActionHidden('create');
    });

    test('hay un tope de opciones por grupo', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        actInPanel(panelMember($restaurant), $restaurant);

        $options = array_map(fn (int $i): array => ['name_es' => "Opción {$i}", 'price_delta' => 0, 'available' => true], range(1, OptionGroupsRelationManager::MAX_OPTIONS + 1));

        groupManager($dish)
            ->callTableAction('create', data: [
                'kind' => 'choice', 'name_es' => 'Muchas', 'min_choices' => 0, 'max_choices' => 1, 'position' => 0, 'options' => $options,
            ])
            ->assertHasTableActionErrors(['options']);

        expect(OptionGroup::query()->count())->toBe(0);
    });
});
