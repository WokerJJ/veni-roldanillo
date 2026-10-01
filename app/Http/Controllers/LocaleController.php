<?php

namespace App\Http\Controllers;

use App\Enums\Locale;
use App\Http\Middleware\SetLocale;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Uri;
use Illuminate\Validation\Rule;

/**
 * Cambio de idioma desde el selector (ADR 0010): lo recuerda en el dispositivo
 * con la cookie y, si hay sesión, en la cuenta.
 */
class LocaleController extends Controller
{
    public function __invoke(Request $request): RedirectResponse
    {
        $request->validate([
            'locale' => ['required', Rule::enum(Locale::class)],
        ]);

        $locale = $request->enum('locale', Locale::class) ?? Locale::DEFAULT;

        $request->user()?->update(['locale' => $locale]);

        return redirect()
            ->to($this->previousUrlWithoutLang($request))
            ->withCookie(SetLocale::cookie($locale));
    }

    /**
     * Página desde la que se cambió el idioma, sin ?lang: si se quedara, el
     * parámetro volvería a imponer el idioma anterior. El Referer lo controla
     * quien hace la petición, así que solo se vuelve a una URL de este sitio.
     */
    private function previousUrlWithoutLang(Request $request): string
    {
        $home = route('home');

        return rescue(function () use ($request, $home): string {
            $previous = Uri::of(url()->previous($home));

            return $previous->host() === $request->getHost()
                ? (string) $previous->withoutQuery([SetLocale::QUERY])
                : $home;
        }, $home, report: false);
    }
}
