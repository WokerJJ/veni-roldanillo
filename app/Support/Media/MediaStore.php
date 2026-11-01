<?php

namespace App\Support\Media;

use App\Enums\MediaKind;
use App\Support\Origin;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Dónde y con qué nombre quedan las imágenes (#113, ADR 0034).
 *
 * Una imagen procesada se nombra por su **clave**, `media/<tipo>/<hash>`,
 * que es lo que guarda la columna (`dishes.photo_path`,
 * `promotions.image_path`). Cada ancho es un archivo `<clave>-<ancho>.webp`
 * en el disco de config('media.disk'). El hash sale del contenido de la
 * versión grande: una imagen nueva es una URL nueva, y cada URL se puede
 * guardar para siempre en cualquier caché (`immutable`). También entra el id
 * del registro, para que dos platos con la misma foto no compartan archivos
 * (borrar la de uno no rompe la del otro), pero no se puede leer en la URL:
 * la ficha no publica ids de la base.
 *
 * El original espera en el disco privado config('media.pending_disk'), en
 * `media-pending/`, hasta que lo procesa la cola. Para cada registro se
 * recuerda cuál es el último original enviado (`expect`): si el dueño sube
 * otra foto o la quita antes de que termine, el trabajo viejo descarta lo
 * suyo en vez de pisar la nueva.
 */
final class MediaStore
{
    public const string PENDING_DIRECTORY = 'media-pending';

    /** El disco de las versiones públicas. */
    public static function disk(): Filesystem
    {
        return Storage::disk(config()->string('media.disk'));
    }

    public static function pendingDisk(): Filesystem
    {
        return Storage::disk(config()->string('media.pending_disk'));
    }

    public static function isKey(?string $key, MediaKind $kind): bool
    {
        return $key !== null && preg_match('#^media/'.$kind->value.'/[0-9a-f]{20}$#', $key) === 1;
    }

    public static function variantPath(string $key, int $width): string
    {
        return "{$key}-{$width}.webp";
    }

    /**
     * La URL de un ancho. Si el disco sirve desde el mismo origen que
     * APP_URL (el disco `public`), sin el origen (`/storage/…`): vale igual
     * con cualquier nombre con que se llegue a la app (127.0.0.1 o localhost
     * en desarrollo) y la CSP la acepta como 'self'.
     */
    public static function url(string $key, int $width): string
    {
        $url = self::disk()->url(self::variantPath($key, $width));
        $origin = Origin::fromUrl($url);

        return $origin !== null && $origin === Origin::fromUrl(config('app.url')) ? substr($url, strlen($origin)) : $url;
    }

    /**
     * `src` (el ancho de en medio) y `srcset` con los tres, o null si no hay
     * imagen procesada.
     *
     * @return array{src: string, srcset: string}|null
     */
    public static function published(?string $key, MediaKind $kind): ?array
    {
        if (! self::isKey($key, $kind)) {
            return null;
        }

        /** @var string $key */
        $srcset = array_map(fn (int $width): string => self::url($key, $width)." {$width}w", $kind->widths());

        return ['src' => self::url($key, $kind->defaultWidth()), 'srcset' => implode(', ', $srcset)];
    }

    /**
     * Guarda las versiones y devuelve la clave nueva.
     *
     * @param  array<int, string>  $variants  WebP por ancho (ImageProcessor).
     */
    public static function store(MediaKind $kind, int $recordId, array $variants): string
    {
        // Los anchos van de menor a mayor: el último es el grande.
        $largest = (string) end($variants);
        $key = 'media/'.$kind->value.'/'.substr(hash('sha256', $recordId.':'.$largest), 0, 20);

        foreach ($variants as $width => $bytes) {
            self::disk()->put(self::variantPath($key, $width), $bytes, [
                'visibility' => 'public',
                'mimetype' => 'image/webp',
                'CacheControl' => 'public, max-age=31536000, immutable',
            ]);
        }

        return $key;
    }

    /** Borra las versiones de una clave (si es una clave válida de ese tipo). */
    public static function delete(?string $key, MediaKind $kind): void
    {
        if (! self::isKey($key, $kind)) {
            return;
        }

        /** @var string $key */
        self::disk()->delete(array_map(fn (int $width): string => self::variantPath($key, $width), $kind->widths()));
    }

    /** Guarda un original en el disco privado y devuelve su ruta ahí. */
    public static function keepPending(UploadedFile $file, string $mime): string
    {
        $extension = match ($mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };

        $path = self::PENDING_DIRECTORY.'/'.Str::uuid()->toString().'.'.$extension;
        self::pendingDisk()->put($path, (string) file_get_contents($file->getRealPath()));

        return $path;
    }

    public static function isPendingPath(mixed $path): bool
    {
        return is_string($path) && preg_match('#^'.self::PENDING_DIRECTORY.'/[0-9a-f-]{36}\.(jpg|png|webp)$#', $path) === 1;
    }

    /** Recuerda que $pending es el último original de ese registro. */
    public static function expect(MediaKind $kind, int $recordId, ?string $pending): void
    {
        $token = "media:{$kind->value}:{$recordId}";

        if ($pending === null) {
            Cache::forget($token);

            return;
        }

        Cache::put($token, $pending, now()->addDay());
    }

    public static function isExpected(MediaKind $kind, int $recordId, string $pending): bool
    {
        return Cache::get("media:{$kind->value}:{$recordId}") === $pending;
    }
}
