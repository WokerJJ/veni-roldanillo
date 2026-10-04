<?php

use App\Support\FrameAncestors;

return [

    /*
    |--------------------------------------------------------------------------
    | Política de seguridad de contenido (CSP)
    |--------------------------------------------------------------------------
    |
    | La arma App\Support\ContentSecurityPolicy en cada respuesta (ADR 0014).
    |
    | - CSP_REPORT_ONLY=true: el navegador no bloquea nada, solo anota en la
    |   consola lo que bloquearía. Lo normal, también en desarrollo, es
    |   bloquear; en producción la app lo avisa en el registro al arrancar.
    | - CSP_REPORT_CANDIDATE=true: además de la vigente, que sigue
    |   bloqueando, manda la candidata (el perfil `candidate`, registrado en
    |   código) en Content-Security-Policy-Report-Only, para probar un cambio
    |   sin romper nada. Con CSP_REPORT_ONLY no se manda.
    |   Los dos se leen como booleanos: true, on, yes o 1; cualquier otro
    |   valor (false, off, no, 0) es no.
    | - CSP_FRAME_ANCESTORS: orígenes separados por comas que pueden mostrar
    |   la app en un iframe; sin valor, ninguno. Solo para entornos locales
    |   (el tablero de avance en http://localhost:8765). Un valor que no es
    |   un origen detiene el arranque.
    |
    */

    'csp' => [
        'report_only' => filter_var(env('CSP_REPORT_ONLY', false), FILTER_VALIDATE_BOOLEAN),
        'report_candidate' => filter_var(env('CSP_REPORT_CANDIDATE', false), FILTER_VALIDATE_BOOLEAN),
        'frame_ancestors' => FrameAncestors::parse(env('CSP_FRAME_ANCESTORS')),
    ],

];
