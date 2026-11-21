<?php

namespace App\Support;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Vite;

/**
 * Lo que el inicio pide enseguida con el mapa, que la vista raíz adelanta
 * desde el HTML para que empiece a bajar junto con la entrada y no cuando esta
 * ya terminó de ejecutarse (ADR 0051).
 *
 * El motor del mapa (MapLibre y PMTiles) es un chunk que el frontend carga con
 * `import()` al montar el mapa (ADR 0007): Vite no lo anuncia en el HTML. Aquí
 * se lee su lista de módulos del manifest de la compilación.
 *
 * Acoplamiento: la existencia y la forma del manifest se comprueban en
 * `public/build/manifest.json`, pero las URL las resuelve `Vite::asset()`, que
 * usa el directorio de compilación y el manifest que tenga configurados Vite
 * (`useBuildDirectory()`, `useManifestFilename()`) y lanza si falta una clave.
 * Esto es solo una optimización: cualquier fallo se traga y no se adelanta
 * nada, nunca puede costar un 500 al inicio.
 */
final class MapPreload
{
    /** El módulo del motor, como lo nombra el manifest de Vite. */
    public const ENGINE = 'resources/js/map/engine.ts';

    /**
     * Las URL del motor y de los módulos que comparte, para `rel="modulepreload"`.
     * Vacía si no hay compilación (desarrollo con el servidor de Vite, o sin
     * `npm run build`), si el manifest no trae el motor o si Vite no puede
     * resolver alguno de sus módulos.
     *
     * @return list<string>
     */
    public static function engineModules(): array
    {
        if (Vite::isRunningHot()) {
            return [];
        }

        $path = public_path('build/manifest.json');

        if (! File::exists($path)) {
            return [];
        }

        /** @var mixed $manifest */
        $manifest = json_decode(File::get($path), true);

        if (! is_array($manifest) || ! isset($manifest[self::ENGINE]) || ! is_array($manifest[self::ENGINE])) {
            return [];
        }

        $urls = [];
        $seen = [];

        try {
            self::collect($manifest, self::ENGINE, $seen, $urls);
        } catch (\Throwable) {
            return [];
        }

        return $urls;
    }

    /**
     * @param  array<array-key, mixed>  $manifest
     * @param  array<string, true>  $seen
     * @param  list<string>  $urls
     */
    private static function collect(array $manifest, string $key, array &$seen, array &$urls): void
    {
        if (isset($seen[$key]) || ! isset($manifest[$key]) || ! is_array($manifest[$key])) {
            return;
        }

        $seen[$key] = true;
        $chunk = $manifest[$key];

        if (isset($chunk['file']) && is_string($chunk['file'])) {
            $urls[] = Vite::asset($key);
        }

        $imports = $chunk['imports'] ?? [];

        foreach (is_array($imports) ? $imports : [] as $import) {
            if (is_string($import)) {
                self::collect($manifest, $import, $seen, $urls);
            }
        }
    }
}
