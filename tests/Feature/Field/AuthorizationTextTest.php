<?php

use App\Models\FieldSubmission;

/**
 * La autorización del dueño (ADR 0048) queda registrada como «la versión X»
 * del texto (`owner_authorization_version`). Igual que los documentos legales
 * (ADR 0030, LegalPagesTest): si el texto cambia y la versión no, ese registro
 * deja de decir qué leyó el dueño.
 */

/** Las claves de lang/{idioma}/field.php que forman el texto que acepta el dueño. */
const FIELD_AUTHORIZATION_KEYS = [
    'confirm.intro',
    'confirm.owner',
    'confirm.role_owner',
    'confirm.role_manager',
    'confirm.authorization_title',
    'confirm.authorization',
    'confirm.privacy',
    'confirm.privacy_link',
    'confirm.button',
];

/** El texto, en español e inglés, tal como lo huella tests/fixtures/legal-hashes.php. */
function fieldAuthorizationText(): string
{
    $text = [];

    foreach (['es', 'en'] as $locale) {
        foreach (FIELD_AUTHORIZATION_KEYS as $key) {
            $text[$locale][$key] = trans("field.{$key}", [], $locale);
        }
    }

    return json_encode($text, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

test('el texto de la autorización del dueño fija su versión: cambiarlo exige subir AUTHORIZATION_VERSION', function () {
    /** @var array<string, array<string, string>> $hashes */
    $hashes = require base_path('tests/fixtures/legal-hashes.php');
    $version = FieldSubmission::AUTHORIZATION_VERSION;

    expect($hashes['field_authorization'] ?? [])->toHaveKey($version, message: "La autorización {$version} no tiene huella en tests/fixtures/legal-hashes.php");
    expect(hash('sha256', fieldAuthorizationText()))->toBe($hashes['field_authorization'][$version], 'El texto de la autorización del dueño cambió sin cambiar su versión: subí FieldSubmission::AUTHORIZATION_VERSION y agregá la huella nueva a tests/fixtures/legal-hashes.php.');
});

test('cada clave del texto de la autorización existe en español e inglés', function (string $locale, string $key) {
    expect(trans("field.{$key}", [], $locale))->not->toBe("field.{$key}")->not->toBeEmpty();
})->with(fn (): array => collect(['es', 'en'])->crossJoin(FIELD_AUTHORIZATION_KEYS)->all());
