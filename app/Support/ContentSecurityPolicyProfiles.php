<?php

namespace App\Support;

use Closure;
use InvalidArgumentException;

/**
 * Perfiles de la política de contenido por ruta (ADR 0014). Una ruta declara
 * el suyo en la acción, sola o por su grupo:
 *
 *     Route::group(['csp' => 'panel'], …);
 *
 * Sin declarar ninguno, la ruta lleva el perfil público
 * (ContentSecurityPolicy::PUBLIC_PROFILE), que es la política tal cual.
 *
 * Regla: los paneles no relajan la política pública. Un perfil recibe la
 * política pública de la petición y le suma con with() solo lo que su ruta
 * necesita; el perfil público no se redefine. Se registran al arrancar, en
 * un proveedor de servicios, cada uno con su prueba.
 */
final class ContentSecurityPolicyProfiles
{
    /** @var array<string, Closure(ContentSecurityPolicy): ContentSecurityPolicy> */
    private array $profiles = [];

    /**
     * @param  Closure(ContentSecurityPolicy): ContentSecurityPolicy  $profile
     *
     * @throws InvalidArgumentException con el nombre del perfil público.
     */
    public function register(string $name, Closure $profile): void
    {
        if ($name === ContentSecurityPolicy::PUBLIC_PROFILE) {
            throw new InvalidArgumentException('El perfil público de la CSP no se redefine: se cambia en App\Support\ContentSecurityPolicy, con su prueba.');
        }

        $this->profiles[$name] = $profile;
    }

    public function has(string $name): bool
    {
        return $name === ContentSecurityPolicy::PUBLIC_PROFILE || isset($this->profiles[$name]);
    }

    /**
     * La política del perfil $name, a partir de la pública.
     *
     * @throws InvalidArgumentException si no hay un perfil con ese nombre: una
     *                                  ruta mal declarada falla a la vista en
     *                                  lugar de llevar otra política.
     */
    public function apply(string $name, ContentSecurityPolicy $policy): ContentSecurityPolicy
    {
        if ($name === ContentSecurityPolicy::PUBLIC_PROFILE) {
            return $policy;
        }

        $profile = $this->profiles[$name] ?? throw new InvalidArgumentException("Perfil de CSP desconocido: «{$name}».");

        return $profile($policy);
    }
}
