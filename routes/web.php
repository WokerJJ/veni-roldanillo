<?php

use App\Http\Controllers\LocaleController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'Home')->name('home');

// Límite por IP real (AppServiceProvider): 429 con el aviso en el idioma de la petición.
Route::put('/locale', LocaleController::class)
    ->middleware('throttle:locale')
    ->name('locale.update');
