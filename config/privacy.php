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

    /*
    |--------------------------------------------------------------------------
    | Quién responde por los datos (#23, Decreto 1377 de 2013)
    |--------------------------------------------------------------------------
    |
    | La política de tratamiento de datos (/privacy) nombra al responsable con
    | su nombre legal, su domicilio y su teléfono. Nunca los reales en el
    | repositorio: aquí no hay valor por defecto y la página dice «pendiente»;
    | en producción, App\Support\LegalReadiness avisa en el registro si faltan.
    |
    */

    'controller' => [
        'holder' => env('VENI_PRIVACY_CONTROLLER_HOLDER'),
        'address' => env('VENI_PRIVACY_CONTROLLER_ADDRESS'),
        'phone' => env('VENI_PRIVACY_CONTROLLER_PHONE'),
    ],

];
