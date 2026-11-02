<?php

/*
|--------------------------------------------------------------------------
| Fotos de los platos e imágenes de las promociones (#113, ADR 0034)
|--------------------------------------------------------------------------
|
| Lo que sube el dueño desde su panel no se publica tal cual: el servidor lo
| revisa, lo recorta a la proporción, lo guarda en tres tamaños WebP sin
| metadatos y borra el original (App\Jobs\ProcessUploadedImage). Los tamaños
| y las proporciones de cada tipo están en App\Enums\MediaKind.
|
| - disk: el disco de config/filesystems.php donde quedan las versiones
|   públicas. Por defecto `public` (storage/app/public, servido en /storage,
|   un volumen en producción: docker-compose.yml). Un disco S3 compatible
|   también sirve: se configura en filesystems.php con sus variables AWS_* y
|   aquí se nombra; si su URL es de otro origen, la CSP lo suma a img-src
|   (App\Support\Media\MediaOrigin).
| - pending_disk: dónde espera el original hasta que lo procesa la cola. Es
|   privado: el original trae el EXIF (puede traer la ubicación del dueño) y
|   nunca se sirve.
| - max_kilobytes: tope de peso de lo que se sube (también lo revisa el
|   navegador antes de enviarlo).
| - max_side / max_pixels: tope de dimensiones antes de abrir la imagen. Una
|   imagen comprimida puede pesar poco y ocupar cientos de MB al abrirla.
| - quality: calidad fija de las WebP (0–100).
|
*/

return [
    'disk' => env('MEDIA_DISK', 'public'),
    'pending_disk' => env('MEDIA_PENDING_DISK', 'local'),
    'max_kilobytes' => 8192,
    'max_side' => 8000,
    'max_pixels' => 40_000_000,
    'quality' => 80,
];
