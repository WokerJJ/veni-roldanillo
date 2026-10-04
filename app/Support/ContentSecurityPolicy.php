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
 * - Nada de iframes que muestren esta app (salvo los orígenes de
 *   CSP_FRAME_ANCESTORS, solo en local), `<object>`, cambios de `<base>` ni
 *   formularios hacia otro sitio.
 *
 * Es la política del perfil público, la de todas las rutas que no declaran
 * otro. Un perfil (App\Support\ContentSecurityPolicyProfiles) parte de ella y
 * le suma con with() lo que su ruta necesita.
 */
final class ContentSecurityPolicy
{
    /** Perfil de las rutas que no declaran otro: el sitio público. */
    public const PUBLIC_PROFILE = 'public';

    /**
     * Perfil que, con CSP_REPORT_CANDIDATE, se manda además en
     * Content-Security-Policy-Report-Only para probar un cambio.
     */
    public const CANDIDATE_PROFILE = 'candidate';

    /**
     * Fuentes que le suman los perfiles, por directiva (with()).
     *
     * @var array<string, list<string>>
     */
    private array $additions = [];

    /**
     * @param  list<string>  $mapOrigins  Orígenes del mapa (MapOrigin::configured()).
     * @param  string|null  $devServer  Origen del servidor de Vite en desarrollo (`npm run dev`).
     * @param  bool  $reportOnly  Solo informar, sin bloquear (CSP_REPORT_ONLY).
     * @param  list<string>  $frameAncestors  Orígenes que pueden mostrarla en un iframe (FrameAncestors::configured()); vacía, ninguno.
     */
    public function __construct(
        private readonly string $nonce,
        private readonly array $mapOrigins = [],
        private readonly ?string $devServer = null,
        private readonly bool $reportOnly = false,
        private readonly array $frameAncestors = [],
    ) {}

    /**
     * Otra política igual a esta, con $sources sumadas a $directive (o con la
     * directiva, si no estaba). Esta no cambia: la del perfil público sigue
     * igual para las demás rutas.
     */
    public function with(string $directive, string ...$sources): self
    {
        $policy = clone $this;
        $policy->additions[$directive] = [...($this->additions[$directive] ?? []), ...array_values($sources)];

        return $policy;
    }

    /** La cabecera que bloquea o la que solo informa. */
    public function headerName(): string
    {
        return $this->reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    }

    public function headerValue(): string
    {
        $directives = [];

        foreach ($this->directives() as $name => $sources) {
            $directives[] = trim($name.' '.implode(' ', $sources));
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
            'frame-ancestors' => $this->frameAncestors === [] ? ["'none'"] : $this->frameAncestors,
        ];

        foreach ($this->additions as $name => $sources) {
            // 'none' junto a otra fuente no es válido: las fuentes lo reemplazan.
            $current = ($directives[$name] ?? []) === ["'none'"] ? [] : ($directives[$name] ?? []);
            $directives[$name] = array_values(array_unique([...$current, ...$sources]));
        }

        // El navegador ignora frame-ancestors en una política que solo
        // informa, y lo avisa en la consola de cada página. X-Frame-Options
        // (SetSecurityHeaders) sigue impidiendo los iframes, salvo con
        // CSP_FRAME_ANCESTORS (solo en local).
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
