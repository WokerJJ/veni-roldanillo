<?php

return [

    /*
    |--------------------------------------------------------------------------
    | CORS: peticiones desde otro origen
    |--------------------------------------------------------------------------
    |
    | La app pide su API (/api/*) desde su mismo origen, y para eso el
    | navegador no necesita permiso. Por eso no hay ninguna ruta habilitada:
    | ninguna respuesta lleva Access-Control-Allow-Origin y otro sitio no puede
    | leerlas desde el navegador de una persona. Sin este archivo, Laravel
    | habilita api/* para cualquier origen (*), y cada ruta nueva lo hereda.
    |
    | Abrir una ruta a otro origen es una decisión aparte: se nombra la ruta en
    | «paths» y el origen en «allowed_origins» (nunca *), con su prueba en
    | tests/Feature/Http/CorsTest.php.
    |
    */

    'paths' => [],

    'allowed_methods' => ['*'],

    'allowed_origins' => [],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
