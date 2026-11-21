<?php

use App\Enums\ClaimStatus;
use App\Enums\Fulfillment;
use App\Enums\RestaurantRole;
use App\Filament\Admin\Widgets\CatalogStatusWidget;
use App\Filament\Admin\Widgets\MenuFreshnessWidget;
use App\Filament\Admin\Widgets\OrderIntentsWidget;
use App\Models\DailyMenu;
use App\Models\Dish;
use App\Models\MenuSection;
use App\Models\OrderIntent;
use App\Models\Restaurant;
use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use App\Models\User;
use App\Support\CatalogOverview;
use App\Support\MenuFreshness;
use App\Support\OrderIntentRanking;
use App\Support\OrderIntentStats;
use Carbon\CarbonImmutable;
use Filament\Facades\Filament;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;

/*
| Escritorio de administración (ADR 0050): tres widgets de solo lectura sobre
| datos que ya existen. Solo el rol admin los ve.
*/

uses(RefreshDatabase::class);

function dashboardAdmin(): User
{
    $admin = User::factory()->admin()->create();
    test()->actingAs($admin);
    Filament::setCurrentPanel(Filament::getPanel('admin'));
    Filament::bootCurrentPanel();

    return $admin;
}

function tapAt(Restaurant $restaurant, string $at): void
{
    OrderIntent::factory()->for($restaurant)->create([
        'fulfillment' => Fulfillment::Delivery,
        'created_at' => CarbonImmutable::parse($at, 'America/Bogota'),
    ]);
}

/** Fija updated_at sin pasar por Eloquent, que lo pondría en ahora. */
function touchMenu(string $table, int $id, string $at): void
{
    DB::table($table)->where('id', $id)->update(['updated_at' => CarbonImmutable::parse($at, 'America/Bogota')]);
}

describe('quién lo ve', function () {
    test('administración ve los tres widgets en /admin', function () {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->get('/admin')->assertOk()
            ->assertSee(__('panel.admin.dashboard.catalog.heading'))
            ->assertSee(__('panel.admin.dashboard.freshness.heading'))
            ->assertSee(__('panel.admin.dashboard.clicks.heading'));
    });

    test('un dueño y un empleado no entran al Escritorio; sin sesión, al login', function () {
        $restaurant = Restaurant::factory()->claimed()->create();

        $this->get('/admin')->assertRedirect('/admin/login');
        $this->actingAs(panelMember($restaurant))->get('/admin')->assertForbidden();
        $this->actingAs(panelMember($restaurant, RestaurantRole::Staff))->get('/admin')->assertForbidden();
    });

    test('cada widget se niega a quien no es admin, aunque llegue a su componente', function () {
        $restaurant = Restaurant::factory()->claimed()->create();
        $owner = panelMember($restaurant);
        $widgets = [CatalogStatusWidget::class, MenuFreshnessWidget::class, OrderIntentsWidget::class];

        Filament::setCurrentPanel(Filament::getPanel('admin'));

        foreach ($widgets as $widget) {
            expect($widget::canView())->toBeFalse();
            // Filament autoriza en bootCanAuthorizeAccess, antes de mount(): se fija aquí por si cambia.
            Livewire::actingAs($owner)->test($widget)->assertForbidden();
        }

        dashboardAdmin();

        foreach ($widgets as $widget) {
            expect($widget::canView())->toBeTrue();
        }
    });
});

describe('estado del catálogo', function () {
    test('sin datos, todo en cero', function () {
        $overview = CatalogOverview::current();

        expect($overview->published())->toBe(0)
            ->and($overview->hidden)->toBe(0)
            ->and($overview->claimed)->toBe(0)
            ->and($overview->pendingClaims)->toBe(0)
            ->and($overview->pendingRemovals)->toBe(0)
            ->and($overview->openFieldSubmissions)->toBe(0);
    });

    test('cuenta publicadas, reclamadas y ocultas sin mezclar, y las solicitudes pendientes', function () {
        Restaurant::factory()->count(2)->create();
        Restaurant::factory()->claimed()->create();
        Restaurant::factory()->hidden()->count(3)->create();
        RestaurantClaim::factory()->count(2)->create();
        RestaurantRemovalRequest::factory()->create();

        $overview = CatalogOverview::current();

        // Las solicitudes traen su propia ficha sin reclamar: se comparan con la tabla.
        expect($overview->unclaimed)->toBe(Restaurant::query()->where('status', 'unclaimed')->count())
            ->and($overview->claimed)->toBe(1)
            ->and($overview->hidden)->toBe(3)
            ->and($overview->published())->toBe($overview->unclaimed + 1)
            ->and($overview->unclaimed)->toBeGreaterThanOrEqual(2)
            ->and($overview->pendingClaims)->toBe(2)
            ->and($overview->pendingRemovals)->toBe(1);
    });

    test('una solicitud ya resuelta no cuenta como pendiente', function () {
        $claim = RestaurantClaim::factory()->create();
        expect(CatalogOverview::current()->pendingClaims)->toBe(1);

        $claim->forceFill(['status' => ClaimStatus::Rejected, 'review_note' => 'No es el dueño.', 'reviewed_at' => now(), 'reviewed_by' => User::factory()->admin()->create()->id])->save();

        expect(CatalogOverview::current()->pendingClaims)->toBe(0);
    });

    test('el widget enlaza a los recursos', function () {
        dashboardAdmin();

        Livewire::test(CatalogStatusWidget::class)
            ->assertSeeHtml('/admin/restaurants')
            ->assertSeeHtml('/admin/claims')
            ->assertSeeHtml('/admin/removals');
    });
});

describe('frescura de los menús', function () {
    test('sin restaurantes, el widget lo dice', function () {
        dashboardAdmin();

        expect(MenuFreshness::rows())->toBe([]);
        Livewire::test(MenuFreshnessWidget::class)->assertSeeHtml('data-empty');
    });

    test('un solo restaurante sin menú sale como «sin menú»', function () {
        $restaurant = Restaurant::factory()->create();

        $rows = MenuFreshness::rows();

        expect($rows)->toHaveCount(1)
            ->and($rows[0]->id)->toBe($restaurant->id)
            ->and($rows[0]->last_at)->toBeNull()
            ->and($rows[0]->days)->toBeNull();
    });

    test('toma lo más reciente entre platos, secciones y almuerzo del día, y ordena del más viejo al más nuevo', function () {
        $now = CarbonImmutable::parse('2026-11-20 12:00', 'America/Bogota');
        $old = Restaurant::factory()->create(['name' => 'Vieja']);
        $mid = Restaurant::factory()->create(['name' => 'Media']);
        $fresh = Restaurant::factory()->create(['name' => 'Fresca']);
        $empty = Restaurant::factory()->create(['name' => 'Vacía']);

        $oldDish = Dish::factory()->for($old)->for(MenuSection::factory()->for($old))->create();
        touchMenu('dishes', $oldDish->id, '2026-11-01 10:00');
        touchMenu('menu_sections', $oldDish->menu_section_id, '2026-11-01 10:00');

        $midSection = MenuSection::factory()->for($mid)->create();
        touchMenu('menu_sections', $midSection->id, '2026-11-10 10:00');

        $lunch = DailyMenu::factory()->for($fresh)->create();
        touchMenu('daily_menus', $lunch->id, '2026-11-19 09:00');

        $rows = MenuFreshness::rows($now);

        expect(array_map(fn ($row) => $row->name, $rows))->toBe(['Vacía', 'Vieja', 'Media', 'Fresca'])
            ->and($rows[0]->id)->toBe($empty->id)
            ->and($rows[1]->days)->toBe(19)
            ->and($rows[2]->days)->toBe(10)
            ->and($rows[3]->days)->toBe(1);
    });

    test('un cambio en el almuerzo de hoy pone al restaurante al día aunque su carta sea vieja', function () {
        $now = CarbonImmutable::parse('2026-11-20 12:00', 'America/Bogota');
        $restaurant = Restaurant::factory()->create();
        $section = MenuSection::factory()->for($restaurant)->create();
        touchMenu('menu_sections', $section->id, '2026-09-01 10:00');
        $lunch = DailyMenu::factory()->for($restaurant)->create();
        touchMenu('daily_menus', $lunch->id, '2026-11-20 08:00');

        expect(MenuFreshness::rows($now)[0]->days)->toBe(0);
    });

    test('los días son de Colombia: las 11 p. m. de ayer son «1 día», aunque en UTC ya sea hoy', function () {
        $now = CarbonImmutable::parse('2026-11-20 00:30', 'America/Bogota');
        $restaurant = Restaurant::factory()->create();
        $section = MenuSection::factory()->for($restaurant)->create();
        touchMenu('menu_sections', $section->id, '2026-11-19 23:00'); // 04:00 UTC del 20

        expect(MenuFreshness::rows($now)[0]->days)->toBe(1);
    });

    test('cruza el cambio de mes y de año contando fechas de calendario', function () {
        $now = CarbonImmutable::parse('2027-01-02 09:00', 'America/Bogota');
        $restaurant = Restaurant::factory()->create();
        $section = MenuSection::factory()->for($restaurant)->create();
        touchMenu('menu_sections', $section->id, '2026-12-30 20:00');

        expect(MenuFreshness::rows($now)[0]->days)->toBe(3);
    });

    test('las fichas ocultas no aparecen', function () {
        Restaurant::factory()->hidden()->create();
        $visible = Restaurant::factory()->claimed()->create();

        expect(array_map(fn ($row) => $row->id, MenuFreshness::rows()))->toBe([$visible->id]);
    });

    test('muestra solo las más atrasadas y dice cuántas hay', function () {
        dashboardAdmin();
        Restaurant::factory()->count(MenuFreshnessWidget::SHOWN + 3)->create();

        Livewire::test(MenuFreshnessWidget::class)
            ->assertSeeHtml('data-summary')
            ->assertSee(__('panel.admin.dashboard.freshness.more', ['shown' => MenuFreshnessWidget::SHOWN, 'total' => MenuFreshnessWidget::SHOWN + 3]));
    });

    test('no hace una consulta por restaurante', function () {
        Restaurant::factory()->count(5)->create();

        DB::enableQueryLog();
        MenuFreshness::rows();
        $few = count(DB::getQueryLog());
        DB::flushQueryLog();

        Restaurant::factory()->count(10)->create();
        DB::flushQueryLog();
        MenuFreshness::rows();

        expect(count(DB::getQueryLog()))->toBe($few)->and($few)->toBe(1);
    });
});

describe('toques en «Enviar pedido por WhatsApp»', function () {
    test('sin datos: ceros, sin ranking y sin porcentaje', function () {
        dashboardAdmin();
        $now = CarbonImmutable::parse('2026-11-20 12:00', 'America/Bogota');

        $stats = OrderIntentStats::overall(7, $now);

        expect($stats->current)->toBe(0)->and($stats->previous)->toBe(0)->and($stats->change())->toBeNull()
            ->and(OrderIntentRanking::top(7, 10, $now))->toBe([]);

        Livewire::test(OrderIntentsWidget::class)
            ->assertSeeHtml('data-stat="current">0<')
            ->assertSeeHtml('data-empty');
    });

    test('suma todos los restaurantes, por día de Colombia y contra el período anterior', function () {
        $now = CarbonImmutable::parse('2026-11-20 12:00', 'America/Bogota');
        $a = Restaurant::factory()->create();
        $b = Restaurant::factory()->create();
        tapAt($a, '2026-11-20 08:00');
        tapAt($b, '2026-11-20 23:30'); // 04:30 del 21 en UTC: es del 20
        tapAt($a, '2026-11-14 00:10'); // primer día de los últimos 7
        tapAt($b, '2026-11-13 23:50'); // último del período anterior
        tapAt($a, '2026-11-07 00:00'); // primer día del anterior
        tapAt($a, '2026-11-06 23:59'); // fuera
        tapAt($a, '2026-11-21 00:00'); // mañana: no cuenta

        $stats = OrderIntentStats::overall(7, $now);

        expect($stats->current)->toBe(3)
            ->and($stats->previous)->toBe(2)
            ->and($stats->perDay['2026-11-20'])->toBe(2)
            ->and($stats->perDay['2026-11-14'])->toBe(1)
            ->and(array_key_first($stats->perDay))->toBe('2026-11-14');
    });

    test('cruza el cambio de mes', function () {
        $now = CarbonImmutable::parse('2026-12-02 12:00', 'America/Bogota');
        $restaurant = Restaurant::factory()->create();
        tapAt($restaurant, '2026-12-02 10:00');
        tapAt($restaurant, '2026-11-30 22:00');
        tapAt($restaurant, '2026-11-26 08:00'); // primer día de los últimos 7

        $stats = OrderIntentStats::overall(7, $now);

        expect($stats->current)->toBe(3)
            ->and($stats->perDay['2026-11-30'])->toBe(1)
            ->and($stats->perDay['2026-12-01'])->toBe(0);
    });

    test('el porcentaje solo vale con un período anterior de al menos 20 toques', function () {
        $now = CarbonImmutable::parse('2026-11-20 12:00', 'America/Bogota');
        $restaurant = Restaurant::factory()->create();
        tapAt($restaurant, '2026-11-20 10:00');
        tapAt($restaurant, '2026-11-13 10:00');

        $few = OrderIntentStats::overall(7, $now);
        expect($few->percentIsMeaningful())->toBeFalse();

        foreach (range(1, OrderIntentStats::MIN_PREVIOUS_FOR_PERCENT) as $ignored) {
            tapAt($restaurant, '2026-11-13 11:00');
        }

        expect(OrderIntentStats::overall(7, $now)->percentIsMeaningful())->toBeTrue();
    });

    test('con pocos toques el widget muestra los números, no un porcentaje', function () {
        dashboardAdmin();
        $restaurant = Restaurant::factory()->create();
        OrderIntent::factory()->for($restaurant)->create(['created_at' => now()->subDays(8)]);
        OrderIntent::factory()->for($restaurant)->count(3)->create(['created_at' => now()]);

        Livewire::test(OrderIntentsWidget::class)
            ->assertSeeHtml('data-stat="current">3<')
            ->assertSee(__('panel.admin.dashboard.clicks.change_few', ['previous' => 1, 'days' => 7]))
            ->assertDontSee('% más');
    });

    test('el ranking ordena por toques, deja fuera a quien no tuvo ninguno y trae el período anterior', function () {
        $now = CarbonImmutable::parse('2026-11-20 12:00', 'America/Bogota');
        $top = Restaurant::factory()->create(['name' => 'Arriba']);
        $second = Restaurant::factory()->create(['name' => 'Segundo']);
        $onlyBefore = Restaurant::factory()->create(['name' => 'Solo antes']);
        tapAt($top, '2026-11-20 10:00');
        tapAt($top, '2026-11-19 10:00');
        tapAt($top, '2026-11-12 10:00');
        tapAt($second, '2026-11-18 10:00');
        tapAt($onlyBefore, '2026-11-10 10:00');

        $ranking = OrderIntentRanking::top(7, 10, $now);

        expect($ranking)->toHaveCount(2)
            ->and($ranking[0]->name)->toBe('Arriba')
            ->and($ranking[0]->current)->toBe(2)
            ->and($ranking[0]->previous)->toBe(1)
            ->and($ranking[1]->name)->toBe('Segundo')
            ->and($ranking[1]->previous)->toBe(0);
    });

    test('el ranking solo incluye fichas publicadas; las ocultas con toques no salen', function () {
        $now = CarbonImmutable::parse('2026-11-20 12:00', 'America/Bogota');
        $visible = Restaurant::factory()->create(['name' => 'Visible']);
        $hidden = Restaurant::factory()->hidden()->create(['name' => 'Oculta']);
        tapAt($visible, '2026-11-20 10:00');
        tapAt($hidden, '2026-11-20 10:00');
        tapAt($hidden, '2026-11-20 11:00');

        expect(array_map(fn ($row) => $row->name, OrderIntentRanking::top(7, 10, $now)))->toBe(['Visible']);
    });

    test('con los mismos conteos y el mismo nombre, el ranking desempata por id', function () {
        $now = CarbonImmutable::parse('2026-11-20 12:00', 'America/Bogota');
        $first = Restaurant::factory()->create(['name' => 'Homónimo']);
        $second = Restaurant::factory()->create(['name' => 'Homónimo']);
        // Se insertan al revés para que el orden físico no ayude.
        tapAt($second, '2026-11-20 10:00');
        tapAt($first, '2026-11-20 10:00');

        expect(array_map(fn ($row) => $row->id, OrderIntentRanking::top(7, 10, $now)))->toBe([$first->id, $second->id]);
    });

    test('el ranking respeta el límite y no hace una consulta por restaurante', function () {
        $now = CarbonImmutable::parse('2026-11-20 12:00', 'America/Bogota');
        Restaurant::factory()->count(5)->create()->each(fn (Restaurant $restaurant) => tapAt($restaurant, '2026-11-20 10:00'));

        DB::enableQueryLog();
        $ranking = OrderIntentRanking::top(7, 3, $now);

        expect($ranking)->toHaveCount(3)->and(DB::getQueryLog())->toHaveCount(1);
    });

    test('el período que llega del navegador se acota a 7 o 30', function () {
        dashboardAdmin();

        Livewire::test(OrderIntentsWidget::class)
            ->call('setPeriod', 30)->assertSet('days', 30)
            ->call('setPeriod', '7')->assertSet('days', 7)
            ->call('setPeriod', 9999)->assertSet('days', 9999)->assertSeeHtml('data-period="7"')
            ->assertSee(__('panel.stats.current', ['days' => 7]));
    });

    test('un período que no es un entero da 404, no un 500', function () {
        dashboardAdmin();

        Livewire::test(OrderIntentsWidget::class)->call('setPeriod', 'abc')->assertNotFound();
    });
});
