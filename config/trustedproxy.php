<?php

use App\Support\TrustedProxies;

return [

    /*
    |--------------------------------------------------------------------------
    | Proxies de confianza
    |--------------------------------------------------------------------------
    |
    | En producción TLS termina en un proxy delante de la aplicación (ADR 0014),
    | que le pasa el esquema, el host, el puerto y la IP del cliente en las
    | cabeceras X-Forwarded-*. Solo se aceptan de las IP o rangos de
    | TRUSTED_PROXIES; sin valor, de nadie. El middleware TrustProxies de
    | Laravel lee esta clave; qué cabeceras acepta se fija en bootstrap/app.php.
    | Valores para cada caso en docs/despliegue.md.
    |
    */

    'proxies' => TrustedProxies::parse(env('TRUSTED_PROXIES')),

];
