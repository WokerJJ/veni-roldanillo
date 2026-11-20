<?php

use App\Enums\FieldSubmissionStatus;
use App\Enums\RestaurantStatus;
use App\Filament\Admin\Resources\FieldSubmissions\FieldSubmissionResource;
use App\Filament\Admin\Resources\FieldSubmissions\Pages\ListFieldSubmissions;
use App\Models\FieldSubmission;
use App\Models\Restaurant;
use App\Models\User;
use App\Support\GeoPoint;
use Filament\Facades\Filament;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;

uses(RefreshDatabase::class);

/**
 * La revisión de las capturas de campo en /admin (ADR 0048): solo
 * administración, solo se aprueba con la confirmación del dueño y se crea la
 * ficha oculta.
 */
function fieldPanelAdmin(): User
{
    $admin = User::factory()->admin()->create();
    test()->actingAs($admin);
    Filament::setCurrentPanel(Filament::getPanel('admin'));
    Filament::bootCurrentPanel();

    return $admin;
}

test('solo administración entra a las capturas de campo', function () {
    $this->get('/admin/field-submissions')->assertRedirect();

    $this->actingAs(User::factory()->create());
    $this->get('/admin/field-submissions')->assertForbidden();

    $this->actingAs(User::factory()->admin()->create());
    $this->get('/admin/field-submissions')->assertOk();
});

test('la lista arranca en las que esperan una decisión y cada una muestra su estado', function () {
    $admin = fieldPanelAdmin();
    $waiting = FieldSubmission::factory()->create(['captured_by' => $admin->id]);
    $ready = FieldSubmission::factory()->confirmed()->create(['captured_by' => $admin->id]);
    $done = FieldSubmission::factory()->confirmed()->create(['captured_by' => $admin->id, 'status' => 'approved', 'reviewed_at' => now()]);

    Livewire::test(ListFieldSubmissions::class)
        ->assertCanSeeTableRecords([$waiting, $ready])
        ->assertCanNotSeeTableRecords([$done])
        ->filterTable('status', 'approved')
        ->assertCanSeeTableRecords([$done])
        ->assertCanNotSeeTableRecords([$waiting, $ready]);
});

test('ver una captura muestra todo lo capturado, el punto en OpenStreetMap y la confirmación', function () {
    $admin = fieldPanelAdmin();
    $submission = FieldSubmission::factory()->confirmed()->create(['captured_by' => $admin->id]);

    Livewire::test(ListFieldSubmissions::class)
        ->mountTableAction('view', $submission)
        ->assertSuccessful();

    $html = FieldSubmissionResource::details($submission)->render();

    expect($html)->toContain('Calle de Prueba # 1-23')
        ->toContain('lunes')
        ->toContain('11:00–15:00')
        ->toContain('openstreetmap.org/?mlat=')
        ->toContain('Persona de Prueba')
        ->toContain('aviso 0.5');
});

test('aprobar crea la ficha oculta y verificada y deja la captura aprobada', function () {
    $admin = fieldPanelAdmin();
    $submission = FieldSubmission::factory()->confirmed()->create(['captured_by' => $admin->id]);

    Livewire::test(ListFieldSubmissions::class)
        ->callTableAction('approve', $submission)
        ->assertNotified(__('panel.admin.field.approved'));

    $submission->refresh();
    $restaurant = Restaurant::query()->findOrFail($submission->restaurant_id);

    expect($submission->status)->toBe(FieldSubmissionStatus::Approved)
        ->and($submission->reviewed_by)->toBe($admin->id)
        ->and($restaurant->status)->toBe(RestaurantStatus::Hidden)
        ->and($restaurant->verified_at)->not->toBeNull();
});

test('sin la confirmación del dueño no hay botón de aprobar, y el servidor tampoco lo deja', function () {
    $admin = fieldPanelAdmin();
    $submission = FieldSubmission::factory()->create(['captured_by' => $admin->id]);

    Livewire::test(ListFieldSubmissions::class)
        ->assertTableActionHidden('approve', $submission)
        ->assertTableActionVisible('send_back', $submission);

    expect(Restaurant::query()->count())->toBe(0);
});

test('con una ficha parecida hay que decir que es otro negocio para aprobar', function () {
    $admin = fieldPanelAdmin();
    $submission = FieldSubmission::factory()->at(new GeoPoint(4.4120, -76.1540))->confirmed()->create(['captured_by' => $admin->id]);
    $existing = Restaurant::factory()->create(['name' => 'Vecino de al lado', 'location' => new GeoPoint(4.41205, -76.1540)]);

    Livewire::test(ListFieldSubmissions::class)
        ->callTableAction('approve', $submission, data: ['distinct_from' => []])
        ->assertHasTableActionErrors(['distinct_from' => 'required']);

    expect($submission->refresh()->status)->toBe(FieldSubmissionStatus::OwnerConfirmed);

    Livewire::test(ListFieldSubmissions::class)
        ->callTableAction('approve', $submission, data: ['distinct_from' => [$existing->id]])
        ->assertNotified(__('panel.admin.field.approved'));

    expect($submission->refresh()->status)->toBe(FieldSubmissionStatus::Approved)
        ->and(Restaurant::query()->count())->toBe(2);
});

test('devolver y rechazar piden el motivo y borran la confirmación del dueño', function () {
    $admin = fieldPanelAdmin();
    $one = FieldSubmission::factory()->confirmed()->create(['captured_by' => $admin->id]);
    $two = FieldSubmission::factory()->create(['captured_by' => $admin->id]);

    Livewire::test(ListFieldSubmissions::class)
        ->callTableAction('send_back', $one, data: ['note' => ''])
        ->assertHasTableActionErrors(['note' => 'required']);

    Livewire::test(ListFieldSubmissions::class)
        ->callTableAction('send_back', $one, data: ['note' => 'Falta la referencia'])
        ->assertNotified(__('panel.admin.field.sent_back'))
        ->callTableAction('reject', $two, data: ['note' => 'El local no existe'])
        ->assertNotified(__('panel.admin.field.rejected'));

    $one->refresh();

    expect($one->status)->toBe(FieldSubmissionStatus::Returned)
        ->and($one->owner_confirmed_at)->toBeNull()
        ->and($two->refresh()->status)->toBe(FieldSubmissionStatus::Rejected)
        ->and($two->review_note)->toBe('El local no existe');
});

test('si el contenido cambió después de la confirmación, el panel avisa y no crea nada', function () {
    $admin = fieldPanelAdmin();
    $submission = FieldSubmission::factory()->confirmed()->create(['captured_by' => $admin->id]);
    $submission->forceFill(['payload' => [...$submission->payload, 'name' => 'Cambiado a escondidas']])->save();

    Livewire::test(ListFieldSubmissions::class)
        ->callTableAction('approve', $submission)
        ->assertNotified(__('panel.admin.refused.content_changed'));

    expect(Restaurant::query()->count())->toBe(0)
        ->and($submission->refresh()->status)->toBe(FieldSubmissionStatus::OwnerConfirmed);
});
