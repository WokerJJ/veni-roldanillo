<?php

namespace App\Support\Media;

use App\Support\Origin;

/**
 * El origen de las fotos de los platos y promociones (#113, ADR 0034) para
 * `img-src` de la CSP, solo si no es el de la app. Con el disco `public` las
 * fotos salen de APP_URL/storage, que ya es 'self'; con un disco S3 o una
 * CDN (MEDIA_DISK) salen de otro host y hay que nombrarlo.
 */
final class MediaOrigin
{
    /** @return list<string> */
    public static function configured(): array
    {
        $disk = config('media.disk');
        $media = Origin::fromUrl(config('filesystems.disks.'.(is_string($disk) ? $disk : 'public').'.url'));

        return $media === null || $media === Origin::fromUrl(config('app.url')) ? [] : [$media];
    }
}
