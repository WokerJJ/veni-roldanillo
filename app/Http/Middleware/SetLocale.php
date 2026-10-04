<?php

namespace App\Http\Middleware;

use App\Enums\Locale;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Cookie as CookieJar;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\AcceptHeader;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;

/**
 * Idioma de la petición, resuelto en el servidor para que el HTML y
 * <html lang> lleguen ya en el idioma correcto (ADR 0010). Orden:
 * ?lang (y lo fija en la cookie), cookie, cuenta, Accept-Language y español.
 * Un valor inválido en una fuente se ignora y decide la siguiente.
 *
 * Las páginas de error que salen sin pasar por aquí (una ruta que no existe,
 * el modo de mantenimiento) usan el mismo orden con forErrorPage().
 */
class SetLocale
{
    public const QUERY = 'lang';

    /** Preferencia de la interfaz, no un dato personal: va sin cifrar. */
    public const COOKIE = 'locale';

    /** Un año, en minutos. */
    public const COOKIE_MINUTES = 60 * 24 * 365;

    /** Atributo de la petición que dice que este middleware ya decidió. */
    private const RESOLVED = 'veni.locale';

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $fromQuery = self::fromQuery($request);
        $locale = self::resolve($request, withAccount: true);

        App::setLocale($locale->value);
        $request->attributes->set(self::RESOLVED, $locale);

        // Un enlace (GET) solo fija la cookie; la cuenta cambia con el selector.
        if ($fromQuery !== null) {
            CookieJar::queue(self::cookie($fromQuery));
        }

        $response = $next($request);

        $response->headers->set('Content-Language', $locale->value);
        $response->setVary(['Accept-Language', 'Cookie'], false);

        return $response;
    }

    /** Cookie que recuerda el idioma en el dispositivo. */
    public static function cookie(Locale $locale): Cookie
    {
        return CookieJar::make(self::COOKIE, $locale->value, self::COOKIE_MINUTES, '/', null, null, true, false, 'lax');
    }

    /**
     * Idioma de la petición en el orden de arriba. Sin $withAccount se salta
     * la cuenta, que necesita la sesión.
     */
    public static function resolve(Request $request, bool $withAccount): Locale
    {
        return self::fromQuery($request)
            ?? self::fromCookie($request)
            ?? ($withAccount ? self::fromUser($request) : null)
            ?? self::fromHeader($request)
            ?? Locale::DEFAULT;
    }

    /**
     * Idioma de una página de error. Si este middleware ya corrió, el suyo se
     * queda (también el de la cuenta). Si no, como en el 404 de una ruta que
     * no existe, el mismo orden sin la cuenta: sin el grupo web no hay sesión,
     * y leerla podría volver a fallar dentro del error. Así tampoco queda el
     * idioma de la petición anterior del mismo worker de Octane.
     */
    public static function forErrorPage(Request $request): void
    {
        if (! $request->attributes->has(self::RESOLVED)) {
            App::setLocale(self::resolve($request, withAccount: false)->value);
        }
    }

    private static function fromQuery(Request $request): ?Locale
    {
        return self::parse($request->query(self::QUERY));
    }

    private static function fromCookie(Request $request): ?Locale
    {
        return self::parse($request->cookie(self::COOKIE));
    }

    private static function fromUser(Request $request): ?Locale
    {
        $user = $request->user();

        return $user instanceof User ? $user->locale : null;
    }

    /**
     * Primer idioma disponible según la calidad (q) de cada uno; q=0 es «no».
     * Solo cuenta el idioma, no la región: es-CO → es, en-US → en.
     */
    private static function fromHeader(Request $request): ?Locale
    {
        $header = $request->headers->get('Accept-Language');

        if ($header === null || trim($header) === '') {
            return null;
        }

        foreach (AcceptHeader::fromString($header)->all() as $item) {
            if ($item->getQuality() <= 0) {
                continue;
            }

            $language = Str::lower(Str::before(str_replace('_', '-', $item->getValue()), '-'));
            $locale = Locale::tryFrom($language);

            if ($locale !== null) {
                return $locale;
            }
        }

        return null;
    }

    private static function parse(mixed $value): ?Locale
    {
        return is_string($value) ? Locale::tryFrom($value) : null;
    }
}
