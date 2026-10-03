<?php

use App\Support\TrustedProxies;

return [

    /*
    |--------------------------------------------------------------------------
    | Proxies de confianza
    |--------------------------------------------------------------------------
    |
    | En producción TLS termina en un proxy delante de la aplicación (ADR 0014),
    | que le pasa el esquema y la IP del cliente en X-Forwarded-Proto y
    | X-Forwarded-For. Solo se aceptan de las IP o rangos de TRUSTED_PROXIES;
    | sin valor, de nadie. El middleware TrustProxies de Laravel lee esta
    | clave; qué cabeceras acepta (no X-Forwarded-Host ni -Port) se fija en
    | bootstrap/app.php.
    | Valores para cada caso en docs/despliegue.md.
    |
    */

    'proxies' => TrustedProxies::parse(env('TRUSTED_PROXIES')),

];
