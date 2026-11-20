<?php

/*
| Textos del modo Campo (ADR 0048) que solo usa el servidor: el mensaje de
| WhatsApp para el dueño, la página de confirmación y los avisos de
| validación. Van aparte de lang/es.json, que viaja entero al navegador.
| El texto de la autorización es PROVISIONAL (versión 0.1) hasta que lo
| revise un abogado (docs/04-seguridad-y-legal.md).
*/

return [
    'validation' => [
        'hours' => 'Revisá el horario: las franjas de un mismo día no pueden cruzarse ni abrir y cerrar a la misma hora.',
    ],

    'whatsapp' => [
        'greeting' => 'Hola :owner, soy de Vení Roldanillo. Pasé por :name y armé esta ficha para mostrarla en la app.',
        'summary' => 'Esto es lo que quedó:',
        'line_address' => 'Dirección: :value',
        'line_categories' => 'Tipo de comida: :value',
        'line_phone' => 'Teléfono: :value',
        'line_whatsapp' => 'WhatsApp: :value',
        'line_delivery' => 'Domicilio: :value',
        'line_payments' => 'Medios de pago: :value',
        'line_hours' => 'Horario:',
        'yes' => 'sí',
        'no' => 'no',
        'call_to_action' => 'Revisala y, si está bien, confirmala acá (el enlace vale :days días y se usa una sola vez):',
    ],

    'days' => ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],

    'payments' => [
        'cash' => 'efectivo',
        'nequi' => 'Nequi',
        'daviplata' => 'Daviplata',
        'card' => 'tarjeta',
    ],

    'confirm' => [
        'draft' => 'Borrador pendiente de revisión jurídica',
        'title' => 'Confirmá la ficha de tu negocio',
        'intro' => 'Una persona de Vení Roldanillo levantó estos datos en tu local. Revisalos: solo se muestran en la app si los confirmás.',
        'owner' => 'Quién confirma: :name (:role)',
        'role_owner' => 'dueño o dueña',
        'role_manager' => 'administración del negocio',
        'authorization_title' => 'Tu autorización',
        'authorization' => 'Confirmo que soy la persona que puede decidirlo en este negocio y autorizo a Vení Roldanillo a publicar en su app y su sitio web la información del negocio que aparece arriba (nombre, tipo de comida, dirección, ubicación, teléfono, WhatsApp, horario, domicilio y medios de pago). Puedo pedir que la corrijan o la retiren cuando quiera.',
        'privacy' => 'Tus datos de contacto (nombre y celular) se usan solo para verificar quién autoriza y para escribirte sobre esta ficha, no se publican ni se comparten. Podés consultarlos, corregirlos o pedir que los borren.',
        'privacy_link' => 'Política de tratamiento de datos',
        'button' => 'Confirmo',
        'sending' => 'Confirmando…',
        'not_ok' => 'Si algo no está bien, no confirmes: avisale a quien te mandó el enlace y te mandará uno nuevo.',
        'done_title' => 'Listo, gracias',
        'done' => 'Registramos tu confirmación. Una persona del equipo revisa la ficha y la publica. Si algo cambia en lo que viste, te volvemos a escribir.',
        'invalid_title' => 'Este enlace ya no sirve',
        'invalid' => 'El enlace venció, ya se usó o no existe. Pedile a quien te lo mandó uno nuevo.',
        'changed' => 'Los datos cambiaron mientras los mirabas. Recargá la página y revisalos de nuevo.',
        'hours' => 'Horario',
        'no_hours' => 'Sin horario cargado',
        'categories' => 'Tipo de comida',
        'address' => 'Dirección',
        'phone' => 'Teléfono',
        'whatsapp' => 'WhatsApp',
        'delivery' => 'Domicilio',
        'payments' => 'Medios de pago',
        'yes' => 'Sí',
        'no' => 'No',
    ],
];
