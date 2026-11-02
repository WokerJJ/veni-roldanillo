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
        '0.3' => '35d27d57b6a1ba350eb3de66bdeee9bdf18c70f680df383a1a4425527a152c58',
        '0.4' => 'dad99e7d7b52f69f6eec0358f86aa7310a064f33ef9fc896c4c0256504f4a363',
        '0.5' => '8d66790d2c84e9ef80d80169b829494fa906662702a7ff73c7356d61d326cd91',
    ],
    'terms' => [
        '0.1' => 'd719204c70753a5ef238e2e7069c123d29a4508a45b67ce7f34aea347d893a7a',
        '0.2' => '0941fd18febeb06b7bb4f71783e0f7102bc57ea7dace2b2d2bf289b7f17b6302',
        '0.3' => '37f83ca80da348646a8d4ada1e400ed99ffe5a1ca7703b303b1c6cc73c75de02',
    ],
    'reviews' => [
        '0.1' => 'a5aad8e9aca8ad3476dd684f9e3b6ae7c7a6cfb55c21478df57118c8c0edac99',
    ],
];
