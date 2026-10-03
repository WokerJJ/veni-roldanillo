<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Política de seguridad de contenido (CSP)
    |--------------------------------------------------------------------------
    |
    | La arma App\Support\ContentSecurityPolicy en cada respuesta (ADR 0014).
    | Con CSP_REPORT_ONLY=true el navegador no bloquea nada: solo anota en la
    | consola lo que bloquearía. Sirve para probar un cambio de la política
    | antes de activarlo; lo normal, también en desarrollo, es activa.
    |
    */

    'csp' => [
        'report_only' => (bool) env('CSP_REPORT_ONLY', false),
    ],

];
