<?php

use App\Enums\LegalDocument;
use App\Http\Controllers\DishGuideController;
use App\Http\Controllers\Field\FieldSubmissionController;
use App\Http\Controllers\Field\OwnerConfirmationController;
use App\Http\Controllers\LegalDocumentController;
use App\Http\Controllers\LocaleController;
use App\Http\Controllers\RestaurantController;
use App\Http\Controllers\RestaurantRequestController;
use App\Http\Controllers\RobotsController;
use App\Http\Controllers\WebManifestController;
use App\Http\Middleware\PrivateResponse;
use App\Http\Middleware\RequireSameOriginJson;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'Home')->name('home');

// Sin sesión ni cookies: lo piden los buscadores, sin datos de nadie.
Route::get('/robots.txt', RobotsController::class)->withoutMiddleware('web')->name('robots');

// La ficha de un restaurante (#13, ADR 0018). El slug es su dirección pública
// y estable; lo que no tenga forma de slug ni llega a consultar la base. El
// frontend arma la misma dirección en resources/js/restaurants/links.ts.
Route::get('/restaurants/{slug}', [RestaurantController::class, 'show'])
    ->where('slug', '[a-z0-9]+(?:-[a-z0-9]+)*')
    ->name('restaurants.show');

// «¿Es tu negocio? Reclámalo» y «Pedir que retiren esta ficha» (#20, ADR
// 0026): un formulario y su envío, que deja la solicitud pendiente para
// administración. El envío tiene límite por IP y por celular (AppServiceProvider).
Route::controller(RestaurantRequestController::class)
    ->prefix('/restaurants/{slug}')
    ->where(['slug' => '[a-z0-9]+(?:-[a-z0-9]+)*'])
    ->group(function (): void {
        Route::get('/claim', 'claim')->name('restaurants.claim');
        Route::post('/claim', 'storeClaim')->middleware('throttle:restaurant-requests')->name('restaurants.claim.store');
        Route::get('/removal', 'removal')->name('restaurants.removal');
        Route::post('/removal', 'storeRemoval')->middleware('throttle:restaurant-requests')->name('restaurants.removal.store');
    });

// Modo Campo (ADR 0048). El shell es estático, sin sesión ni datos de nadie
// (como /offline): así el service worker puede guardarlo y abrir sin señal.
// Lo que trabaja con datos es la API JSON de abajo, solo para administración:
// los POST y PUT, además del CSRF, exigen venir de la propia app y en JSON
// (RequireSameOriginJson); el GET de /me no lleva cuerpo.
Route::view('/campo', 'campo')
    ->withoutMiddleware('web')
    ->name('field.shell');

Route::prefix('/campo/api')
    ->middleware(['auth', PrivateResponse::class])
    ->controller(FieldSubmissionController::class)
    ->group(function (): void {
        Route::get('/me', 'me')->name('field.me');
        Route::get('/submissions', 'index')->name('field.submissions.index');
        Route::post('/duplicates', 'duplicates')->middleware([RequireSameOriginJson::class, 'throttle:field-lookup'])->name('field.duplicates');
        Route::put('/submissions/{uuid}', 'store')->middleware([RequireSameOriginJson::class, 'throttle:field-submissions'])->whereUuid('uuid')->name('field.submissions.store');
        Route::post('/submissions/{uuid}/confirmation-link', 'confirmationLink')->middleware([RequireSameOriginJson::class, 'throttle:field-submissions'])->whereUuid('uuid')->name('field.confirmation-link');
    });

// La confirmación del dueño, sin cuenta: el código va en la dirección, vale
// una vez y vence. Nada de lo que responde se guarda ni se indexa.
Route::prefix('/confirmar')
    ->middleware(['throttle:owner-confirmation', PrivateResponse::class])
    ->group(function (): void {
        Route::get('/listo', [OwnerConfirmationController::class, 'done'])->name('field.confirm.done');
        Route::get('/{code}', [OwnerConfirmationController::class, 'show'])->where('code', '[A-Za-z0-9_-]{43}')->name('field.confirm.show');
        Route::post('/{code}', [OwnerConfirmationController::class, 'store'])->where('code', '[A-Za-z0-9_-]{43}')->name('field.confirm.store');
    });

// Créditos (#58, ADR 0021): la atribución a OpenStreetMap (ODbL) y cómo pedir
// la parte de la base que viene de allí.
Route::inertia('/credits', 'Credits')->name('credits');

// Documentos legales (#23, ADR 0030): la política de tratamiento de datos, los
// términos de uso y la política de reseñas. El texto, en lang/{idioma}/documents.php.
Route::get('/privacy', LegalDocumentController::class)->defaults('document', LegalDocument::Privacy->value)->name('legal.privacy');
Route::get('/terms', LegalDocumentController::class)->defaults('document', LegalDocument::Terms->value)->name('legal.terms');
Route::get('/reviews-policy', LegalDocumentController::class)->defaults('document', LegalDocument::Reviews->value)->name('legal.reviews');

// La guía de platos típicos (#21): el texto, en lang/{idioma}/guide.php, viaja
// solo a su página (como los documentos legales, ADR 0030).
Route::get('/dishes', DishGuideController::class)->name('dishes.guide');

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
