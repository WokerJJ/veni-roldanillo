<?php

use Inertia\Testing\AssertableInertia as Assert;

test('el inicio pinta la página Home de Inertia', function () {
    // La prueba no depende de que existan los assets compilados de Vite.
    $this->withoutVite();

    $this->get('/')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('Home'));
});
