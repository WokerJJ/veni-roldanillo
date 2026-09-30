<?php

namespace Tests\Feature;

use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class HomePageTest extends TestCase
{
    public function test_home_renders_the_home_inertia_page(): void
    {
        // La prueba no depende de que existan los assets compilados de Vite.
        $this->withoutVite();

        $this->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Home'));
    }
}
