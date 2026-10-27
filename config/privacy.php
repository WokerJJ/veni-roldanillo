<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Datos personales (Ley 1581 de 2012)
    |--------------------------------------------------------------------------
    |
    | El correo al que se escribe para consultar, corregir o pedir que se borren
    | los datos. Lo muestra el aviso de privacidad de los formularios de
    | reclamo y de retiro (ADR 0026). Sin configurar, uno ficticio de
    | example.test: nunca un buzón real en el repositorio.
    |
    */

    'contact_email' => env('VENI_PRIVACY_CONTACT_EMAIL', 'privacidad@example.test'),

];
