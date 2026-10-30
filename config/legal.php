<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Aviso de borrador en los documentos legales (#23, ADR 0030)
    |--------------------------------------------------------------------------
    |
    | La política de datos, los términos y la política de reseñas los redactó
    | el equipo, sin revisión jurídica todavía. Mientras sea así, cada página
    | lo dice arriba. Cuando un abogado los revise (y se suba la versión de
    | cada documento en App\Enums\LegalDocument), se apaga con
    | VENI_LEGAL_DRAFT_NOTICE=false.
    |
    */

    'draft_notice' => (bool) env('VENI_LEGAL_DRAFT_NOTICE', true),

];
