<?php

// Huella (sha256) del texto de cada versión de los documentos legales (#23,
// ADR 0030), en español e inglés; la de la política suma el aviso de los
// formularios (requests.privacy_*). La calcula y la compara
// tests/Feature/LegalPagesTest.php. Al subir una versión se agrega su línea;
// las anteriores se quedan, como registro de lo que dijo cada una.
return [
    'privacy' => [
        '0.1' => '6d0650cd73b8c87e33087ab52002a409c63a4ed95314074d752d87b5465228a2',
        '0.2' => 'e1a4ed7490abf9900cda7a2dc668ec920730a21ea8bed6b9d7864f48a8b930a4',
    ],
    'terms' => [
        '0.1' => 'd719204c70753a5ef238e2e7069c123d29a4508a45b67ce7f34aea347d893a7a',
        '0.2' => '0941fd18febeb06b7bb4f71783e0f7102bc57ea7dace2b2d2bf289b7f17b6302',
    ],
    'reviews' => [
        '0.1' => 'a5aad8e9aca8ad3476dd684f9e3b6ae7c7a6cfb55c21478df57118c8c0edac99',
    ],
];
