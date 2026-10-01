<?php

namespace App\Http\Middleware;

use App\Enums\Locale;
use App\Support\Translations;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Middleware;
use Inertia\OnceProp;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Idioma resuelto por SetLocale, que corre antes (bootstrap/app.php).
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'locale' => Locale::current()->value,
        ];
    }

    /**
     * Traducciones del idioma actual (ADR 0010). La clave lleva el idioma: el
     * cliente las recuerda entre visitas y el servidor las vuelve a enviar
     * solo cuando el idioma cambia.
     *
     * @return array<string, OnceProp>
     */
    public function shareOnce(Request $request): array
    {
        $locale = Locale::current();

        return [
            'translations' => Inertia::once(fn (): array => Translations::for($locale))
                ->as("translations:{$locale->value}"),
        ];
    }
}
