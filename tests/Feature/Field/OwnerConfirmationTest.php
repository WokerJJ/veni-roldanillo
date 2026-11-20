<?php

use App\Actions\Restaurants\CloseFieldSubmission;
use App\Actions\Restaurants\IssueConfirmationLink;
use App\Enums\FieldSubmissionStatus;
use App\Enums\LegalDocument;
use App\Models\FieldSubmission;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * La página con que el dueño confirma (ADR 0048): sin cuenta, de un solo uso,
 * y que mirarla no la consume.
 *
 * @return array{0: FieldSubmission, 1: string}
 */
function awaitingOwner(): array
{
    $admin = User::factory()->admin()->create();
    $submission = FieldSubmission::factory()->create(['captured_by' => $admin->id]);

    return [$submission, app(IssueConfirmationLink::class)->handle($submission, $admin)];
}

beforeEach(fn () => $this->withoutVite());

test('mirar la página muestra el resumen y el aviso, sin consumir el enlace y sin guardarse', function () {
    [$submission, $code] = awaitingOwner();

    $response = $this->get("/confirmar/{$code}")
        ->assertOk()
        ->assertSee($submission->payload['name'])
        ->assertSee('Calle de Prueba # 1-23')
        ->assertSee('Borrador pendiente de revisión jurídica')
        ->assertSee('/privacy', false)
        ->assertSee('lunes')
        ->assertSee($submission->contentHash());

    expect($response->headers->get('Cache-Control'))->toContain('no-store')
        ->and($response->headers->get('X-Robots-Tag'))->toContain('noindex')
        ->and($submission->refresh()->status)->toBe(FieldSubmissionStatus::Submitted)
        ->and($submission->confirmation_token_hash)->not->toBeNull();

    // Ver el celular del dueño o su ubicación no tiene por qué ser parte de la página.
    $response->assertDontSee($submission->owner_phone)->assertDontSee('4.41');
});

test('«Confirmo» registra la firma del dueño y el enlace no sirve una segunda vez', function () {
    [$submission, $code] = awaitingOwner();

    $this->post("/confirmar/{$code}", ['seen_hash' => $submission->contentHash()])
        ->assertRedirect(route('field.confirm.done'));

    $submission->refresh();

    expect($submission->status)->toBe(FieldSubmissionStatus::OwnerConfirmed)
        ->and($submission->owner_confirmed_at)->not->toBeNull()
        ->and($submission->owner_privacy_notice_version)->toBe(LegalDocument::PRIVACY_VERSION)
        ->and($submission->confirmation_phone)->toBe($submission->owner_phone);

    $this->get("/confirmar/{$code}")->assertNotFound();
    $this->post("/confirmar/{$code}", ['seen_hash' => $submission->contentHash()])->assertNotFound();
    $this->get('/confirmar/listo')->assertOk()->assertSee('Listo, gracias');
});

test('si los datos cambiaron mientras los miraba, no confirma y avisa', function () {
    [$submission, $code] = awaitingOwner();

    $this->from("/confirmar/{$code}")->post("/confirmar/{$code}", ['seen_hash' => str_repeat('0', 64)])
        ->assertRedirect("/confirmar/{$code}")
        ->assertSessionHasErrors('seen_hash');

    expect($submission->refresh()->status)->toBe(FieldSubmissionStatus::Submitted)
        ->and($submission->confirmation_token_hash)->not->toBeNull();
});

test('un código inventado, vencido o de otra captura es 404 sin pistas', function () {
    [$submission, $code] = awaitingOwner();

    $this->get('/confirmar/'.str_repeat('a', 43))->assertNotFound();
    $this->get('/confirmar/corto')->assertNotFound();
    $this->post('/confirmar/'.str_repeat('a', 43), ['seen_hash' => $submission->contentHash()])->assertNotFound();

    $this->travel(FieldSubmission::CONFIRMATION_DAYS + 1)->days();
    $this->get("/confirmar/{$code}")->assertNotFound();
});

test('una captura devuelta o rechazada ya no se confirma con su enlace viejo', function () {
    [$submission, $code] = awaitingOwner();
    app(CloseFieldSubmission::class)->sendBack($submission, User::factory()->admin()->create(), 'Corregir');

    $this->get("/confirmar/{$code}")->assertNotFound();
});

test('la página del dueño tiene límite por IP', function () {
    for ($i = 0; $i < AppServiceProvider::OWNER_CONFIRMATIONS_PER_HOUR; $i++) {
        $this->get('/confirmar/'.str_repeat('b', 43))->assertNotFound();
    }

    $this->get('/confirmar/'.str_repeat('b', 43))->assertTooManyRequests();
});
