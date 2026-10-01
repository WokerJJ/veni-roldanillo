<?php

use App\Http\Controllers\LocaleController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'Home')->name('home');

Route::put('/locale', LocaleController::class)->name('locale.update');
