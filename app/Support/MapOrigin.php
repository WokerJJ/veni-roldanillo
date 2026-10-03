<?php

namespace App\Support;

/**
 * Origen (esquema, host y puerto) del que la app descarga el mapa de
 * veni-mapa (ADR 0007): la vista raíz adelanta la conexión con
 * `<link rel="preconnect">` mientras baja el JavaScript, y la política de
 * seguridad de contenido deja pedir ahí el estilo, los tiles, las fuentes,
 * los sprites y el grafo de rutas.
 */
final class MapOrigin
{
    /**
     * @param  mixed  $styleUrl  `VITE_MAP_STYLE_URL` (config `services.map.style_url`): la plantilla `…/veni-{theme}-{locale}.json`.
     * @return string|null `null` si no es una URL http(s) con un host válido: la vista no pone el enlace.
     */
    public static function fromStyleUrl(mixed $styleUrl): ?string
    {
        return Origin::fromUrl($styleUrl);
    }

    /**
     * Orígenes del estilo y del grafo de rutas (`VITE_MAP_ROUTES_URL`), sin
     * repetir. Una release de veni-mapa sirve todo lo demás (tiles, fuentes y
     * sprites) desde el mismo host que el estilo.
     *
     * @return list<string>
     */
    public static function configured(): array
    {
        $origins = [
            Origin::fromUrl(config('services.map.style_url')),
            Origin::fromUrl(config('services.map.routes_url')),
        ];

        return array_values(array_unique(array_filter($origins, fn (?string $origin) => $origin !== null)));
    }
}
