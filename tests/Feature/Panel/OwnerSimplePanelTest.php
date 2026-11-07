<?php

use App\Enums\MediaKind;
use App\Enums\PanelMode;
use App\Enums\RestaurantRole;
use App\Filament\Owner\Concerns\TranslatesConstraintViolations;
use App\Filament\Owner\Pages\MyMenu;
use App\Filament\Owner\Pages\Statistics;
use App\Filament\Owner\Pages\Today;
use App\Filament\Owner\Resources\DeliveryZones\DeliveryZoneResource;
use App\Filament\Owner\Resources\Dishes\DishResource;
use App\Filament\Owner\Resources\Dishes\Pages\EditDishBasics;
use App\Filament\Owner\Resources\Ingredients\IngredientResource;
use App\Filament\Owner\Resources\MenuSections\MenuSectionResource;
use App\Filament\Owner\Resources\OpeningHours\OpeningHourResource;
use App\Filament\Owner\Resources\Promotions\PromotionResource;
use App\Filament\Owner\Resources\SpecialHours\SpecialHourResource;
use App\Filament\Owner\Support\PanelModeSwitch;
use App\Models\DailyMenu;
use App\Models\DeliveryZone;
use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\MenuSection;
use App\Models\Restaurant;
use App\Models\User;
use App\Support\BusinessDay;
use Filament\Livewire\Topbar;
use Filament\Support\Exceptions\Halt;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Livewire\Exceptions\MethodNotFoundException;
use Livewire\Livewire;

/*
| Panel simple del dueño (#114, ADR 0035): Hoy, Mi carta y Promociones por
| defecto, y «Ver todo» para lo demás, recordado por cuenta. Ocultar es solo
| de la navegación: las direcciones y la autorización no cambian.
*/

uses(RefreshDatabase::class);

function fullModeMember(Restaurant $restaurant): User
{
    $user = panelMember($restaurant);
    $user->switchPanelMode(PanelMode::Full);

    return $user;
}

describe('el modo', function () {
    test('una cuenta nueva ve el modo simple', function () {
        $user = User::factory()->create();

        expect($user->fresh()?->panel_mode)->toBe(PanelMode::Simple)
            ->and(DB::table('users')->where('id', $user->id)->value('panel_mode'))->toBe('simple');
    });

    test('la base no acepta otro modo', function () {
        $user = User::factory()->create();

        expect(fn () => DB::table('users')->where('id', $user->id)->update(['panel_mode' => 'expert']))
            ->toThrow(QueryException::class);
    });

    test('no se cambia por asignación masiva', function () {
        $user = User::factory()->create();
        $user->fill(['panel_mode' => 'full'])->save();

        expect($user->fresh()?->panel_mode)->toBe(PanelMode::Simple);
    });

    test('«Ver todo» lo guarda en la cuenta y recarga en Hoy; «Volver al modo simple» lo deshace', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);
        actInPanel($owner, $restaurant);

        Livewire::test(Topbar::class)
            ->assertSee(__('panel.mode.to_full'))
            ->callAction(PanelModeSwitch::TO_FULL)
            ->assertRedirect("/panel/{$restaurant->slug}");

        expect($owner->fresh()?->panel_mode)->toBe(PanelMode::Full);

        actInPanel($owner->fresh() ?? $owner, $restaurant);
        Livewire::test(Topbar::class)
            ->assertSee(__('panel.mode.to_simple'))
            ->callAction(PanelModeSwitch::TO_SIMPLE);

        expect($owner->fresh()?->panel_mode)->toBe(PanelMode::Simple);
    });

    test('también desde Hoy', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);
        actInPanel($owner, $restaurant);

        Livewire::test(Today::class)->callAction(PanelModeSwitch::TO_FULL);

        expect($owner->fresh()?->panel_mode)->toBe(PanelMode::Full);
    });

    test('es de cada cuenta: el otro dueño del mismo restaurante no cambia', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);
        $partner = panelMember($restaurant);
        actInPanel($owner, $restaurant);

        Livewire::test(Today::class)->callAction(PanelModeSwitch::TO_FULL);

        expect($owner->fresh()?->panel_mode)->toBe(PanelMode::Full)
            ->and($partner->fresh()?->panel_mode)->toBe(PanelMode::Simple);
    });

    test('cambiar el modo no se hace por GET', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);

        $this->actingAs($owner)->get("/panel/{$restaurant->slug}?mode=full")->assertOk();

        expect($owner->fresh()?->panel_mode)->toBe(PanelMode::Simple);
    });

    test('una pestaña vieja lleva al modo que muestra, no lo invierte', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);
        actInPanel($owner, $restaurant);

        // Dos pestañas abiertas en el modo simple; la segunda pasa a «Ver todo».
        $stale = Livewire::test(Today::class)->assertSee(__('panel.mode.to_full'));
        Livewire::test(Today::class)->callAction(PanelModeSwitch::TO_FULL);
        expect($owner->fresh()?->panel_mode)->toBe(PanelMode::Full);

        // La primera todavía dice «Ver todo»: tocarlo deja el modo completo.
        actInPanel($owner->fresh() ?? $owner, $restaurant);
        $stale->call('mountAction', PanelModeSwitch::TO_FULL);
        expect($owner->fresh()?->panel_mode)->toBe(PanelMode::Full);

        // «Volver al modo simple» lleva al simple, también repetido.
        Livewire::test(Today::class)->callAction(PanelModeSwitch::TO_SIMPLE);
        actInPanel($owner->fresh() ?? $owner, $restaurant);
        $stale->call('mountAction', PanelModeSwitch::TO_SIMPLE);
        expect($owner->fresh()?->panel_mode)->toBe(PanelMode::Simple);
    });
});

describe('la navegación', function () {
    $hidden = [
        MenuSectionResource::class, DishResource::class, IngredientResource::class,
        OpeningHourResource::class, SpecialHourResource::class, DeliveryZoneResource::class,
        Statistics::class,
    ];

    test('en el modo simple: Hoy, Mi carta y Promociones, y nada más', function () use ($hidden) {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        expect(Today::shouldRegisterNavigation())->toBeTrue()
            ->and(MyMenu::shouldRegisterNavigation())->toBeTrue()
            ->and(PromotionResource::shouldRegisterNavigation())->toBeTrue();

        foreach ($hidden as $class) {
            expect($class::shouldRegisterNavigation())->toBeFalse("{$class} no debería verse en el modo simple");
        }

        $page = (string) $this->get("/panel/{$restaurant->slug}")->assertOk()->getContent();

        expect($page)->toContain("/panel/{$restaurant->slug}/my-menu")
            ->and($page)->toContain("/panel/{$restaurant->slug}/promotions")
            ->and($page)->not->toContain("/panel/{$restaurant->slug}/delivery-zones")
            ->and($page)->not->toContain("/panel/{$restaurant->slug}/special-hours")
            ->and($page)->not->toContain("/panel/{$restaurant->slug}/statistics");
    });

    test('con «Ver todo»: todo, más Hoy y Mi carta', function () use ($hidden) {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(fullModeMember($restaurant), $restaurant);

        foreach ([Today::class, MyMenu::class, PromotionResource::class, ...$hidden] as $class) {
            expect($class::shouldRegisterNavigation())->toBeTrue("{$class} debería verse en el modo completo");
        }

        $page = (string) $this->get("/panel/{$restaurant->slug}")->assertOk()->getContent();

        expect($page)->toContain("/panel/{$restaurant->slug}/my-menu")
            ->and($page)->toContain("/panel/{$restaurant->slug}/delivery-zones")
            ->and($page)->toContain("/panel/{$restaurant->slug}/statistics");
    });

    test('lo oculto sigue en su dirección para el dueño, con la misma autorización', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);
        $zone = DeliveryZone::factory()->for($restaurant)->create();
        $other = panelMember(Restaurant::factory()->claimed()->create());
        $staff = panelMember($restaurant, RestaurantRole::Staff);

        foreach (['menu-sections', 'dishes', 'ingredients', 'opening-hours', 'special-hours', 'delivery-zones', 'statistics', 'profile'] as $slug) {
            $this->actingAs($owner)->get("/panel/{$restaurant->slug}/{$slug}")->assertOk();
            $this->actingAs($other)->get("/panel/{$restaurant->slug}/{$slug}")->assertNotFound();
            $this->actingAs($staff)->get("/panel/{$restaurant->slug}/{$slug}")->assertForbidden();
        }

        $this->actingAs($owner)->get("/panel/{$restaurant->slug}/delivery-zones/{$zone->id}/edit")->assertOk();
        $this->actingAs($other)->get("/panel/{$restaurant->slug}/delivery-zones/{$zone->id}/edit")->assertNotFound();
    });
});

describe('Hoy', function () {
    test('es el inicio del restaurante; otro dueño, un empleado o alguien sin sesión no entran', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);

        $this->get("/panel/{$restaurant->slug}")->assertRedirect('/panel/login');
        $this->actingAs($owner)->get("/panel/{$restaurant->slug}")->assertOk()->assertSee(__('panel.today.dishes_heading'));
        $this->actingAs(panelMember(Restaurant::factory()->claimed()->create()))->get("/panel/{$restaurant->slug}")->assertNotFound();
        $this->actingAs(panelMember($restaurant, RestaurantRole::Staff))->get("/panel/{$restaurant->slug}")->assertForbidden();
    });

    test('muestra solo lo agotado hoy de su restaurante, con el reemplazo del ingrediente', function () {
        $this->travelTo(BusinessDay::today()->setTime(12, 0));
        $today = BusinessDay::today()->toDateString();
        $restaurant = Restaurant::factory()->claimed()->create();
        $soldOut = panelDish($restaurant, ['name_es' => 'Sancocho de gallina', 'sold_out_until' => $today]);
        panelDish($restaurant, ['name_es' => 'Bandeja paisa']);
        panelDish($restaurant, ['name_es' => 'Arroz de ayer', 'sold_out_until' => BusinessDay::today()->subDay()->toDateString()]);
        panelDish(Restaurant::factory()->claimed()->create(), ['name_es' => 'Plato ajeno', 'sold_out_until' => $today]);
        $chicken = Ingredient::factory()->for($restaurant)->create(['name_es' => 'Pollo']);
        Ingredient::factory()->for($restaurant)->create([
            'name_es' => 'Res', 'sold_out_until' => $today,
            'substitute_ingredient_id' => $chicken->id, 'substitute_price_delta' => 2000,
        ]);
        Ingredient::factory()->for(Restaurant::factory()->claimed()->create())->create(['name_es' => 'Ingrediente ajeno', 'sold_out_until' => $today]);

        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(Today::class)
            ->assertSeeHtml("data-dish=\"{$soldOut->id}\"")
            ->assertSee('Sancocho de gallina')
            ->assertDontSee('Bandeja paisa')
            ->assertDontSee('Arroz de ayer')
            ->assertDontSee('Plato ajeno')
            ->assertSee('Res')
            ->assertSee(__('panel.today.substitute_price', ['name' => 'Pollo', 'price' => '$2.000']))
            ->assertDontSee('Ingrediente ajeno');
    });

    test('«Ya hay» devuelve el plato y el ingrediente y mueve «Actualizada el…»', function () {
        $today = BusinessDay::today()->toDateString();
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant, ['sold_out_until' => $today]);
        $ingredient = Ingredient::factory()->for($restaurant)->create(['sold_out_until' => $today]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(Today::class)
            ->call('setDishSoldOut', $dish->id, false)
            ->call('setIngredientSoldOut', $ingredient->id, false)
            ->assertSee(__('panel.today.no_dishes'))
            ->assertSee(__('panel.today.no_ingredients'));

        expect($dish->fresh()?->sold_out_until)->toBeNull()
            ->and($ingredient->fresh()?->sold_out_until)->toBeNull()
            ->and($restaurant->fresh()?->updated_by_owner_at)->not->toBeNull();
    });

    test('«Ya hay» con el id de un plato o ingrediente ajeno da 404 y no lo toca', function () {
        $today = BusinessDay::today()->toDateString();
        $restaurant = Restaurant::factory()->claimed()->create();
        $foreign = Restaurant::factory()->claimed()->create();
        $dish = panelDish($foreign, ['sold_out_until' => $today]);
        $ingredient = Ingredient::factory()->for($foreign)->create(['sold_out_until' => $today]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(Today::class)->call('setDishSoldOut', $dish->id, false)->assertNotFound();
        Livewire::test(Today::class)->call('setIngredientSoldOut', $ingredient->id, false)->assertNotFound();

        expect($dish->fresh()?->sold_out_until?->toDateString())->toBe($today)
            ->and($ingredient->fresh()?->sold_out_until?->toDateString())->toBe($today);
    });

    test('«Falta un ingrediente» lo marca, y no acepta uno ajeno', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $ingredient = Ingredient::factory()->for($restaurant)->create();
        $foreign = Ingredient::factory()->for(Restaurant::factory()->claimed()->create())->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(Today::class)
            ->callAction('markIngredientMissing', data: ['ingredient' => $foreign->id])
            ->assertHasActionErrors(['ingredient']);

        Livewire::test(Today::class)
            ->callAction('markIngredientMissing', data: ['ingredient' => $ingredient->id])
            ->assertHasNoActionErrors();

        expect($ingredient->fresh()?->isSoldOutToday())->toBeTrue()
            ->and($foreign->fresh()?->sold_out_until)->toBeNull();
    });

    test('el aviso de demora es el mismo de la ficha', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(Today::class)
            ->callAction('announceDelay', data: ['minutes' => 40])
            ->assertHasNoActionErrors()
            ->assertSee(__('panel.delay.active', ['minutes' => 40]));

        expect($restaurant->fresh()?->activeDelayMinutes())->toBe(40);

        Livewire::test(Today::class)
            ->callAction('announceDelay', data: ['minutes' => 999])
            ->assertHasActionErrors(['minutes']);

        Livewire::test(Today::class)->callAction('clearDelay');

        expect($restaurant->fresh()?->activeDelayMinutes())->toBeNull();
    });

    test('publica, cambia y quita el almuerzo de hoy, uno por día', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(Today::class)
            ->callAction('publishLunch', data: ['description_es' => 'Sopa, sancocho y jugo', 'price' => 14000])
            ->assertHasNoActionErrors()
            ->assertSee('Sopa, sancocho y jugo')
            ->assertSee('$14.000');

        Livewire::test(Today::class)
            ->callAction('publishLunch', data: ['description_es' => 'Sopa y frijoles', 'price' => 15000])
            ->assertHasNoActionErrors();

        $lunches = DailyMenu::query()->where('restaurant_id', $restaurant->id)->get();
        expect($lunches)->toHaveCount(1)
            ->and($lunches->first()?->description_es)->toBe('Sopa y frijoles')
            ->and($lunches->first()?->price)->toBe(15000)
            ->and($lunches->first()?->served_on->toDateString())->toBe(BusinessDay::today()->toDateString());

        Livewire::test(Today::class)->callAction('clearLunch');

        expect(DailyMenu::query()->where('restaurant_id', $restaurant->id)->exists())->toBeFalse();
    });

    test('el almuerzo valida lo mismo que la base', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(Today::class)
            ->callAction('publishLunch', data: ['description_es' => '   ', 'price' => 0])
            ->assertHasActionErrors(['description_es', 'price']);

        // Solo espacios de Unicode (duro e ideográfico): un error del campo, no un 500.
        Livewire::test(Today::class)
            ->callAction('publishLunch', data: ['description_es' => "\u{00A0}\u{3000}", 'price' => 12000])
            ->assertHasActionErrors(['description_es']);

        Livewire::test(Today::class)
            ->callAction('publishLunch', data: ['description_es' => "\u{00A0}", 'price' => 12000])
            ->assertHasActionErrors(['description_es']);

        Livewire::test(Today::class)
            ->callAction('publishLunch', data: ['description_es' => str_repeat('a', Today::LUNCH_DESCRIPTION_MAX + 1), 'price' => Today::LUNCH_PRICE_MAX + 1])
            ->assertHasActionErrors(['description_es', 'price']);

        expect(DailyMenu::query()->exists())->toBeFalse();
    });

    test('no toca el almuerzo de otro restaurante', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $foreign = DailyMenu::factory()->for(Restaurant::factory()->claimed()->create())->create([
            'served_on' => BusinessDay::today()->toDateString(), 'description_es' => 'Almuerzo ajeno',
        ]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(Today::class)
            ->assertDontSee('Almuerzo ajeno')
            ->assertActionHidden('clearLunch')
            ->callAction('publishLunch', data: ['description_es' => 'El mío', 'price' => 12000])
            ->assertHasNoActionErrors();

        expect($foreign->fresh()?->description_es)->toBe('Almuerzo ajeno')
            ->and(DailyMenu::query()->where('restaurant_id', $restaurant->id)->value('description_es'))->toBe('El mío');
    });

    test('si la base rechaza un nulo (NOT NULL), el dueño ve un aviso, no un 500', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $writer = new class
        {
            use TranslatesConstraintViolations;

            public function write(Closure $write): mixed
            {
                return $this->writeRespectingConstraints($write);
            }

            protected function constraintErrorField(?string $constraint): ?string
            {
                return null;
            }
        };

        expect(fn () => $writer->write(fn () => DB::table('daily_menus')->insert([
            'restaurant_id' => $restaurant->id,
            'served_on' => BusinessDay::today()->toDateString(),
            'description_es' => null,
            'price' => 12000,
        ])))->toThrow(Halt::class);

        expect(DailyMenu::query()->exists())->toBeFalse();
    });

    test('cambiar el almuerzo no pisa un cambio hecho con el modal abierto', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $lunch = DailyMenu::factory()->for($restaurant)->create([
            'served_on' => BusinessDay::today()->toDateString(), 'description_es' => 'Original', 'price' => 12000,
        ]);
        actInPanel(panelMember($restaurant), $restaurant);

        $page = Livewire::test(Today::class)->mountAction('publishLunch');
        $this->travel(2)->seconds();
        $lunch->forceFill(['description_es' => 'Desde otra pestaña'])->save();

        $page->fillForm(['description_es' => 'Mío', 'price' => 13000])
            ->callMountedAction()
            ->assertNotified(__('panel.errors.conflict'));

        expect($lunch->fresh()?->description_es)->toBe('Desde otra pestaña')
            ->and($lunch->fresh()?->price)->toBe(12000);
    });

    test('publicar no pisa un almuerzo que otra pestaña creó con el modal abierto', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        $page = Livewire::test(Today::class)->mountAction('publishLunch');
        DailyMenu::factory()->for($restaurant)->create([
            'served_on' => BusinessDay::today()->toDateString(), 'description_es' => 'De la otra pestaña', 'price' => 12000,
        ]);

        $page->fillForm(['description_es' => 'Mío', 'price' => 13000])
            ->callMountedAction()
            ->assertNotified(__('panel.errors.conflict'));

        expect(DailyMenu::query()->where('restaurant_id', $restaurant->id)->value('description_es'))->toBe('De la otra pestaña');
    });

    test('el almuerzo se lee una sola vez por petición', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        DailyMenu::factory()->for($restaurant)->create(['served_on' => BusinessDay::today()->toDateString()]);
        actInPanel(panelMember($restaurant), $restaurant);

        $reads = 0;
        DB::listen(function ($query) use (&$reads): void {
            if (str_contains($query->sql, 'from "daily_menus"')) {
                $reads++;
            }
        });

        Livewire::test(Today::class)->assertActionVisible('clearLunch');

        expect($reads)->toBe(1);
    });

    test('«Agotado hoy» y «Ya hay» mueven «Actualizada el…» una sola vez', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        $ingredient = Ingredient::factory()->for($restaurant)->create();
        actInPanel(panelMember($restaurant), $restaurant);
        $page = Livewire::test(Today::class);

        $touches = 0;
        DB::listen(function ($query) use (&$touches): void {
            if (str_contains($query->sql, 'update "restaurants"') && str_contains($query->sql, 'updated_by_owner_at')) {
                $touches++;
            }
        });

        $page->call('setDishSoldOut', $dish->id, true);
        expect($touches)->toBe(1);

        // Otro segundo: con la misma hora, «Actualizada el…» no cambiaría y no habría escritura.
        $this->travel(1)->seconds();

        $page->call('setIngredientSoldOut', $ingredient->id, true);
        expect($touches)->toBe(2)
            ->and($dish->fresh()?->isSoldOutToday())->toBeTrue()
            ->and($ingredient->fresh()?->isSoldOutToday())->toBeTrue();
    });

    test('un argumento que no es un id ni un sí/no da 404, no un 500', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(Today::class)->call('setDishSoldOut', 'abc', false)->assertNotFound();
        Livewire::test(Today::class)->call('setIngredientSoldOut', 'abc', false)->assertNotFound();
        Livewire::test(MyMenu::class)->call('setDishSoldOut', 'abc', true)->assertNotFound();
        Livewire::test(MyMenu::class)->call('setDishSoldOut', $dish->id, 'sí')->assertNotFound();
        Livewire::test(MyMenu::class)->call('setDishSoldOut', [$dish->id], true)->assertNotFound();
        Livewire::test(Statistics::class)->call('setPeriod', 'abc')->assertNotFound();

        expect($dish->fresh()?->sold_out_until)->toBeNull();
    });
});

describe('Mi carta', function () {
    test('solo el dueño entra; otro dueño, 404, y un empleado, 403', function () {
        $restaurant = Restaurant::factory()->claimed()->create();

        $this->actingAs(panelMember($restaurant))->get("/panel/{$restaurant->slug}/my-menu")->assertOk();
        $this->actingAs(panelMember(Restaurant::factory()->claimed()->create()))->get("/panel/{$restaurant->slug}/my-menu")->assertNotFound();
        $this->actingAs(panelMember($restaurant, RestaurantRole::Staff))->get("/panel/{$restaurant->slug}/my-menu")->assertForbidden();
    });

    test('muestra los platos de su restaurante con su foto y su precio, y no los ajenos', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $key = 'media/'.MediaKind::Dish->value.'/'.str_repeat('a', 20);
        $dish = panelDish($restaurant, ['name_es' => 'Sancocho', 'price' => 18000, 'photo_path' => $key]);
        panelDish($restaurant, ['name_es' => 'Arepa sin foto']);
        panelDish(Restaurant::factory()->claimed()->create(), ['name_es' => 'Plato ajeno']);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(MyMenu::class)
            ->assertSee('Sancocho')
            ->assertSee('$18.000')
            ->assertSeeHtml("{$key}-192.webp")
            ->assertSee('Arepa sin foto')
            ->assertSee(__('panel.my_menu.no_photo'))
            ->assertDontSee('Plato ajeno')
            ->assertSeeHtml('href="'.DishResource::getUrl('basics', ['record' => $dish]).'"');
    });

    test('dice cómo se ven sus precios en la ficha, sin las secciones que no cuentan', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $mains = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Platos fuertes']);
        $drinks = MenuSection::factory()->for($restaurant)->create(['name_es' => 'Bebidas']);
        Dish::factory()->for($mains)->create(['price' => 16000]);
        Dish::factory()->for($mains)->create(['price' => 22000]);
        Dish::factory()->for($drinks)->create(['price' => 3000]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(MyMenu::class)->assertSeeText('Así se ven tus precios en tu ficha: Platos de $16.000 a $22.000');
    });

    test('sin platos que contar no dice nada de los precios', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(MyMenu::class)->assertDontSeeText('Así se ven tus precios');
    });

    test('el interruptor «Agotado hoy» llega al valor pedido, no lo invierte', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        actInPanel(panelMember($restaurant), $restaurant);

        $page = Livewire::test(MyMenu::class)
            ->assertSeeHtml('aria-pressed="false"')
            ->call('setDishSoldOut', $dish->id, true)
            ->assertSeeHtml('aria-pressed="true"');

        expect($dish->fresh()?->isSoldOutToday())->toBeTrue();

        // Una pantalla vieja que vuelve a pedir «agotado» no lo devuelve.
        $page->call('setDishSoldOut', $dish->id, true);
        expect($dish->fresh()?->isSoldOutToday())->toBeTrue();

        $page->call('setDishSoldOut', $dish->id, false);
        expect($dish->fresh()?->sold_out_until)->toBeNull();
    });

    test('el interruptor no toca un plato ajeno', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $foreign = panelDish(Restaurant::factory()->claimed()->create());
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(MyMenu::class)->call('setDishSoldOut', $foreign->id, true)->assertNotFound();

        expect($foreign->fresh()?->sold_out_until)->toBeNull();
    });

    test('lo que arma la vista no se puede llamar desde el navegador con un plato ajeno', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $key = 'media/'.MediaKind::Dish->value.'/'.str_repeat('b', 20);
        $foreign = panelDish(Restaurant::factory()->claimed()->create(), ['name_es' => 'Plato ajeno', 'photo_path' => $key]);
        actInPanel(panelMember($restaurant), $restaurant);

        foreach (['thumbnail', 'isSoldOut', 'editUrl'] as $method) {
            $page = Livewire::test(MyMenu::class);
            $returned = null;

            try {
                $page->call($method, $foreign->id);
                $returned = $page->effects['returns'] ?? null;
            } catch (MethodNotFoundException) {
                // No es un método que el navegador pueda llamar.
            }

            expect((string) json_encode($returned))->not->toContain($key)
                ->and((string) json_encode($returned))->not->toContain("dishes/{$foreign->id}")
                ->and($returned)->toBeNull();
        }

        // Tampoco las lecturas de la vista de Hoy y Mi carta, que devolvían modelos completos.
        foreach ([[Today::class, ['soldOutDishes', 'missingIngredients', 'lunch', 'delayMinutes']], [MyMenu::class, ['dishes']]] as [$class, $methods]) {
            foreach ($methods as $method) {
                expect(fn () => Livewire::test($class)->call($method))->toThrow(MethodNotFoundException::class);
            }
        }
    });
});

describe('la edición corta del plato', function () {
    test('guarda nombre, precio y descripción, y nada más', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $today = BusinessDay::today()->toDateString();
        $dish = panelDish($restaurant, ['name_es' => 'Sancocho', 'price' => 15000, 'sold_out_until' => $today, 'available' => false, 'position' => 7]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditDishBasics::class, ['record' => $dish->getRouteKey()])
            ->assertSchemaComponentExists('image')
            ->assertSchemaComponentDoesNotExist('menu_section_id')
            ->assertSchemaComponentDoesNotExist('dishIngredients')
            ->fillForm(['name_es' => 'Sancocho de gallina', 'price' => 16000, 'description_es' => 'Con arroz'])
            ->call('save')
            ->assertHasNoFormErrors()
            ->assertRedirect(MyMenu::getUrl());

        $dish->refresh();
        expect($dish->name_es)->toBe('Sancocho de gallina')
            ->and($dish->price)->toBe(16000)
            ->and($dish->description_es)->toBe('Con arroz')
            ->and($dish->sold_out_until?->toDateString())->toBe($today)
            ->and($dish->available)->toBeFalse()
            ->and($dish->position)->toBe(7)
            ->and($restaurant->fresh()?->updated_by_owner_at)->not->toBeNull();
    });

    test('tiene la misma autorización que la edición completa', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant);
        $base = "/panel/{$restaurant->slug}/dishes/{$dish->id}/basics";

        $this->actingAs(panelMember($restaurant))->get($base)->assertOk();
        $this->actingAs(panelMember(Restaurant::factory()->claimed()->create()))->get($base)->assertNotFound();
        $this->actingAs(panelMember($restaurant, RestaurantRole::Staff))->get($base)->assertForbidden();

        $mine = Restaurant::factory()->claimed()->create();
        $this->actingAs(panelMember($mine))->get("/panel/{$mine->slug}/dishes/{$dish->id}/basics")->assertNotFound();
    });

    test('no pisa un cambio hecho mientras estaba abierta', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant, ['price' => 15000]);
        actInPanel(panelMember($restaurant), $restaurant);

        $page = Livewire::test(EditDishBasics::class, ['record' => $dish->getRouteKey()]);
        $this->travel(2)->seconds();
        $dish->forceFill(['price' => 17000])->save();

        $page->fillForm(['price' => 16000])->call('save')->assertNotified(__('panel.errors.conflict'));

        expect($dish->fresh()?->price)->toBe(17000);
    });

    test('guarda también el nombre y la descripción en inglés, opcionales', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $dish = panelDish($restaurant, ['name_es' => 'Sancocho', 'name_en' => null, 'description_en' => null]);
        actInPanel(panelMember($restaurant), $restaurant);

        Livewire::test(EditDishBasics::class, ['record' => $dish->getRouteKey()])
            ->assertSchemaComponentExists('name_en')
            ->assertSchemaComponentExists('description_en')
            ->fillForm(['name_en' => "  Hen stew\u{00A0}", 'description_en' => 'With rice'])
            ->call('save')
            ->assertHasNoFormErrors();

        $dish->refresh();
        expect($dish->name_en)->toBe('Hen stew')
            ->and($dish->description_en)->toBe('With rice');

        Livewire::test(EditDishBasics::class, ['record' => $dish->getRouteKey()])
            ->fillForm(['name_en' => '', 'description_en' => ''])
            ->call('save')
            ->assertHasNoFormErrors();

        $dish->refresh();
        expect($dish->name_en)->toBeNull()
            ->and($dish->description_en)->toBeNull();
    });
});

describe('el contraste', function () {
    test('el texto secundario usa la hoja del panel, con su tono en modo oscuro', function () {
        foreach (['today', 'my-menu', 'statistics'] as $view) {
            expect((string) file_get_contents(resource_path("views/filament/owner/pages/{$view}.blade.php")))
                ->not->toContain('var(--gray-500)')
                ->toContain('veni-muted');
        }

        $css = (string) file_get_contents(resource_path('css/filament/owner-panel.css'));
        expect($css)->toContain('.veni-muted')
            ->toContain('.dark .veni-muted')
            ->toContain('var(--gray-400)');

        $restaurant = Restaurant::factory()->claimed()->create();
        $this->actingAs(panelMember($restaurant))
            ->get("/panel/{$restaurant->slug}")
            ->assertOk()
            ->assertSee('css/app/owner-panel.css', false);
    });
});
