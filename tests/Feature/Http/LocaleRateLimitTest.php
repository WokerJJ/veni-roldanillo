<?php

use App\Providers\AppServiceProvider;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\Response;

/*
| Límite de peticiones de PUT /locale (ADR 0014): cuenta por la IP real del
| cliente, la que da el proxy de confianza, no la del proxy. Pasado el límite
| responde 429 con Retry-After y el aviso traducido.
*/

beforeEach(function () {
    config(['trustedproxy.proxies' => ['172.18.0.1']]);
});

/**
 * Un cambio de idioma que llega por el proxy de confianza desde $clientIp.
 *
 * @return TestResponse<Response>
 */
function localeRateLimitChange(string $clientIp, string $locale = 'en'): TestResponse
{
    return test()->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
        ->withHeaders(['X-Forwarded-For' => $clientIp, 'X-Forwarded-Proto' => 'https'])
        ->from('/')
        ->put('/locale', ['locale' => $locale]);
}

function localeRateLimitExhaust(string $clientIp): void
{
    for ($i = 1; $i <= AppServiceProvider::LOCALE_CHANGES_PER_MINUTE; $i++) {
        localeRateLimitChange($clientIp, $i % 2 === 0 ? 'es' : 'en')->assertRedirect('/');
    }
}

test('pasado el límite por minuto responde 429 con Retry-After y el aviso traducido', function () {
    localeRateLimitExhaust('203.0.113.7');

    $response = localeRateLimitChange('203.0.113.7')
        ->assertStatus(429)
        ->assertHeader('Retry-After')
        ->assertHeader('Content-Type', 'text/plain; charset=UTF-8')
        ->assertCookieMissing('locale');

    expect($response->getContent())->toBe(trans('locale.too_many_changes', [], 'es'))
        ->not->toBe('locale.too_many_changes');
});

test('el aviso sale en el idioma de quien lo pide', function () {
    localeRateLimitExhaust('203.0.113.7');

    $response = $this->withUnencryptedCookie('locale', 'en')
        ->withServerVariables(['REMOTE_ADDR' => '172.18.0.1'])
        ->withHeaders(['X-Forwarded-For' => '203.0.113.7'])
        ->from('/')
        ->put('/locale', ['locale' => 'es'])
        ->assertStatus(429);

    expect($response->getContent())->toBe(trans('locale.too_many_changes', [], 'en'));
});

test('cuenta por la IP del cliente, no por la del proxy que comparten todos', function () {
    localeRateLimitExhaust('203.0.113.7');

    localeRateLimitChange('203.0.113.7')->assertStatus(429);
    localeRateLimitChange('198.51.100.20')->assertRedirect('/');
});

test('al minuto vuelve a dejar cambiar el idioma', function () {
    localeRateLimitExhaust('203.0.113.7');
    localeRateLimitChange('203.0.113.7')->assertStatus(429);

    $this->travel(61)->seconds();

    localeRateLimitChange('203.0.113.7')->assertRedirect('/');
});
