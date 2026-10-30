<?php

use App\Support\LegalReadiness;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;

/*
| Lo que falta para publicar la política de datos (#23): el Decreto 1377 pide
| el nombre, el domicilio, el correo y el teléfono del responsable. En el
| repositorio son ficticios; en producción, la app avisa en el registro si
| siguen así o si el aviso de borrador sigue prendido.
*/

/** Una configuración como la de producción, con datos ficticios pero completos. */
function legalReadinessComplete(): void
{
    config([
        'privacy.contact_email' => 'privacidad@veniroldanillo.co',
        'privacy.controller.holder' => 'Persona Responsable (ficticia)',
        'privacy.controller.address' => 'Calle 0 # 0-00, Roldanillo',
        'privacy.controller.phone' => '+57 300 000 0000',
        'legal.draft_notice' => false,
    ]);
}

test('sin correo real, sin datos del responsable o con el borrador prendido, hay pendientes', function (array $config, string $problem) {
    legalReadinessComplete();
    config($config);

    expect(LegalReadiness::problems())->toHaveCount(1)
        ->and(LegalReadiness::problems()[0])->toContain($problem);
})->with([
    'correo de example.test' => [['privacy.contact_email' => 'privacidad@example.test'], 'VENI_PRIVACY_CONTACT_EMAIL'],
    'correo de example.com' => [['privacy.contact_email' => 'datos@example.com'], 'VENI_PRIVACY_CONTACT_EMAIL'],
    'correo .test' => [['privacy.contact_email' => 'datos@veni.test'], 'VENI_PRIVACY_CONTACT_EMAIL'],
    'sin nombre legal' => [['privacy.controller.holder' => null], 'VENI_PRIVACY_CONTROLLER_HOLDER'],
    'sin domicilio' => [['privacy.controller.address' => ''], 'VENI_PRIVACY_CONTROLLER_ADDRESS'],
    'sin teléfono' => [['privacy.controller.phone' => '  '], 'VENI_PRIVACY_CONTROLLER_PHONE'],
    'borrador prendido' => [['legal.draft_notice' => true], 'VENI_LEGAL_DRAFT_NOTICE'],
]);

test('con todo configurado no hay pendientes', function () {
    legalReadinessComplete();

    expect(LegalReadiness::problems())->toBe([]);
});

test('en producción cada pendiente queda en el registro; en desarrollo, no', function () {
    config(['privacy.contact_email' => 'privacidad@example.test', 'privacy.controller.holder' => null, 'legal.draft_notice' => true]);
    Log::spy();

    LegalReadiness::report();
    Log::shouldNotHaveReceived('warning');

    app()->detectEnvironment(fn (): string => 'production');
    LegalReadiness::report();

    Log::shouldHaveReceived('warning')->times(count(LegalReadiness::problems()));
});

test('la política muestra el nombre, el domicilio y el teléfono del responsable, o que están pendientes', function () {
    $this->withoutVite();
    legalReadinessComplete();

    $text = fn (): string => implode("\n", array_filter(Arr::flatten($this->get('/privacy')->inertiaProps('document')), 'is_string'));

    expect($text())->toContain('Persona Responsable (ficticia)')
        ->toContain('Calle 0 # 0-00, Roldanillo')
        ->toContain('+57 300 000 0000');

    config(['privacy.controller.holder' => null, 'privacy.controller.address' => null, 'privacy.controller.phone' => null]);

    expect(__('documents.pending'))->not->toBe('documents.pending')
        ->and(__('documents.pending', [], 'en'))->not->toBe('documents.pending')
        ->and(substr_count($text(), __('documents.pending')))->toBe(3);
});
