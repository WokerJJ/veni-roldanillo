<?php

use App\Http\Controllers\LocaleController;
use App\Http\Controllers\WebManifestController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'Home')->name('home');

// Límite por IP real (AppServiceProvider): 429 con el aviso en el idioma de la petición.
Route::put('/locale', LocaleController::class)
    ->middleware('throttle:locale')
    ->name('locale.update');

// PWA (#5). Sin el grupo web (sesión, cookies, idioma de la petición): el
// navegador pide el manifest sin cookies y abriría una sesión en cada visita.
// Las cabeceras de seguridad y la CSP son globales y sí las lleva.
Route::get('/manifest.webmanifest', WebManifestController::class)
    ->withoutMiddleware('web')
    ->name('pwa.manifest');

// La página sin conexión, con los textos en los dos idiomas: el service worker
// la guarda al instalarse y la muestra cuando una navegación falla sin red.
// Sin el grupo web, como el manifest: no depende de la sesión ni del idioma.
Route::view('/offline', 'offline')
    ->withoutMiddleware('web')
    ->name('pwa.offline');
