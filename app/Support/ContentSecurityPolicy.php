<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Política de seguridad de contenido de una respuesta (ADR 0014): qué puede
 * cargar y ejecutar la página. La arma SetContentSecurityPolicy con un nonce
 * nuevo en cada petición.
 *
 * - Scripts: los de este origen y los que llevan el nonce (el del tema en la
 *   vista raíz y las etiquetas de @vite). Nada en línea sin nonce, nada de
 *   eval.
 * - Estilos: los de este origen y los `<style>` con el nonce, que son los que
 *   crean la barra de progreso de Inertia, Vite en desarrollo y las páginas
 *   de error. Los estilos que Vue y MapLibre ponen desde JavaScript
 *   (`el.style.…`) no cuentan como en línea y no necesitan nada.
 * - El mapa (ADR 0007): el estilo, los tiles, las fuentes, los sprites y el
 *   grafo de rutas se piden con fetch al host de veni-mapa (`connect-src`).
 *   `img-src` lleva ese host, `data:` (los íconos de los controles de MapLibre
 *   van en su CSS) y `blob:` (MapLibre arma los sprites con una URL blob
 *   donde el navegador no tiene createImageBitmap).
 * - El worker de MapLibre sale de este origen (`worker-src 'self'`). En
 *   desarrollo sale del servidor de Vite, otro origen: MapLibre lo arranca
 *   desde una URL blob que importa el módulo del worker, y los módulos de un
 *   worker se piden como worker. Hacen falta `blob:` y el servidor de Vite.
 * - Nada de iframes que muestren esta app, `<object>`, cambios de `<base>`
 *   ni formularios hacia otro sitio.
 */
final class ContentSecurityPolicy
{
    /**
     * @param  list<string>  $mapOrigins  Orígenes del mapa (MapOrigin::configured()).
     * @param  string|null  $devServer  Origen del servidor de Vite en desarrollo (`npm run dev`).
     * @param  bool  $reportOnly  Solo informar, sin bloquear (CSP_REPORT_ONLY).
     */
    public function __construct(
        private readonly string $nonce,
        private readonly array $mapOrigins = [],
        private readonly ?string $devServer = null,
        private readonly bool $reportOnly = false,
    ) {}

    /** La cabecera que bloquea o la que solo informa. */
    public function headerName(): string
    {
        return $this->reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    }

    public function headerValue(): string
    {
        $directives = [];

        foreach ($this->directives() as $name => $sources) {
            $directives[] = $name.' '.implode(' ', $sources);
        }

        return implode('; ', $directives);
    }

    /**
     * @return array<string, list<string>>
     */
    public function directives(): array
    {
        $self = "'self'";
        $nonce = "'nonce-{$this->nonce}'";
        // El servidor de Vite sirve en desarrollo los módulos, el CSS (que
        // inserta como <style> con el nonce) y las imágenes que importa el
        // código, y avisa de los cambios por un websocket.
        $dev = $this->devServer === null ? [] : [$this->devServer];
        $devSocket = $this->devServer === null ? [] : [self::websocketOrigin($this->devServer)];

        $directives = [
            'default-src' => [$self],
            'script-src' => [$self, $nonce, ...$dev],
            'style-src' => [$self, $nonce, ...$dev],
            'img-src' => [$self, 'data:', 'blob:', ...$this->mapOrigins, ...$dev],
            'font-src' => [$self, ...$dev],
            'connect-src' => [$self, ...$this->mapOrigins, ...$dev, ...$devSocket],
            'worker-src' => $this->devServer === null ? [$self] : [$self, 'blob:', ...$dev],
            'object-src' => ["'none'"],
            'base-uri' => [$self],
            'form-action' => [$self],
            'frame-ancestors' => ["'none'"],
        ];

        // El navegador ignora frame-ancestors en una política que solo
        // informa, y lo avisa en la consola de cada página. X-Frame-Options
        // (SetSecurityHeaders) sigue impidiendo los iframes.
        if ($this->reportOnly) {
            unset($directives['frame-ancestors']);
        }

        return $directives;
    }

    /** `http://localhost:5173` → `ws://localhost:5173`; `https://…` → `wss://…`. */
    private static function websocketOrigin(string $origin): string
    {
        return (str_starts_with($origin, 'https://') ? 'wss://' : 'ws://').Str::after($origin, '://');
    }
}
