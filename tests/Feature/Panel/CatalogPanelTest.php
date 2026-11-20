<?php

use App\Filament\Admin\Resources\Catalog\Pages\CreateCatalogGroup;
use App\Filament\Admin\Resources\Catalog\Pages\CreateCatalogItem;
use App\Filament\Admin\Resources\Catalog\Pages\EditCatalogItem;
use App\Filament\Admin\Resources\Catalog\Pages\ListCatalogItems;
use App\Models\CatalogGroup;
use App\Models\CatalogItem;
use App\Models\User;
use Filament\Facades\Filament;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * El catálogo del modo Campo en /admin (ADR 0049): solo administración, con las
 * presentaciones de cada producto en el mismo formulario.
 */
function catalogPanelAdmin(): User
{
    $admin = User::factory()->admin()->create();
    test()->actingAs($admin);
    Filament::setCurrentPanel(Filament::getPanel('admin'));
    Filament::bootCurrentPanel();

    return $admin;
}

test('solo administración entra al catálogo', function () {
    $this->get('/admin/catalog-items')->assertRedirect();

    $this->actingAs(User::factory()->create());
    $this->get('/admin/catalog-items')->assertForbidden();
    $this->get('/admin/catalog-groups')->assertForbidden();

    $this->actingAs(User::factory()->admin()->create());
    $this->get('/admin/catalog-items')->assertOk();
    $this->get('/admin/catalog-groups')->assertOk();
});

test('la lista de productos filtra por grupo y por alcohol', function () {
    catalogPanelAdmin();
    $beer = CatalogItem::factory()->alcohol()->create(['group_id' => CatalogGroup::factory()->alcohol()]);
    $soda = CatalogItem::factory()->create();

    Livewire::test(ListCatalogItems::class)
        ->assertCanSeeTableRecords([$beer, $soda])
        ->filterTable('is_alcohol', true)
        ->assertCanSeeTableRecords([$beer])
        ->assertCanNotSeeTableRecords([$soda]);
});

test('crear un producto con sus presentaciones, y no repetir el mismo nombre y marca en el grupo', function () {
    catalogPanelAdmin();
    $group = CatalogGroup::factory()->create();

    Livewire::test(CreateCatalogItem::class)
        ->fillForm([
            'group_id' => $group->id, 'brand' => 'Marca', 'name_es' => 'Cola', 'name_en' => 'Cola',
            'variants' => [['label' => '400 ml', 'active' => true], ['label' => '1,5 L', 'active' => true]],
        ])
        ->call('create')
        ->assertHasNoFormErrors();

    $item = CatalogItem::query()->where('name_es', 'Cola')->firstOrFail();

    expect($item->variants()->orderBy('position')->pluck('label')->all())->toBe(['400 ml', '1,5 L']);

    Livewire::test(CreateCatalogItem::class)
        ->fillForm(['group_id' => $group->id, 'brand' => 'Marca', 'name_es' => 'cola'])
        ->call('create')
        ->assertHasFormErrors(['name_es']);

    expect(CatalogItem::query()->count())->toBe(1);
});

test('editar un producto no lo duplica contra sí mismo y deja desactivarlo', function () {
    catalogPanelAdmin();
    $item = CatalogItem::factory()->create(['brand' => 'Marca', 'name_es' => 'Cola']);

    Livewire::test(EditCatalogItem::class, ['record' => $item->getRouteKey()])
        ->fillForm(['name_es' => 'Cola', 'active' => false])
        ->call('save')
        ->assertHasNoFormErrors();

    expect($item->refresh()->active)->toBeFalse();
});

test('un grupo pide la sección del menú que crea y su identificador no se repite', function () {
    catalogPanelAdmin();
    CatalogGroup::factory()->create(['slug' => 'cervezas']);

    Livewire::test(CreateCatalogGroup::class)
        ->fillForm(['name_es' => 'Cervezas', 'slug' => 'cervezas', 'section_name_es' => ''])
        ->call('create')
        ->assertHasFormErrors(['slug', 'section_name_es']);
});
