<?php

namespace App\Support\Media;

use App\Enums\MediaKind;
use GdImage;
use RuntimeException;

/**
 * Convierte el original que subió un dueño en las versiones que se publican
 * (#113, ADR 0034), con GD (viene con PHP: sin servicios ni librerías de
 * pago):
 *
 * 1. Lo abre según el tipo que encontró ImageInspector.
 * 2. Si es un JPEG con orientación en el EXIF (las fotos del celular), lo
 *    gira o lo refleja (las ocho orientaciones): al volver a codificarlo ese
 *    dato se pierde.
 * 3. Lo recorta al centro a la proporción del tipo. El panel ya manda el
 *    recorte que eligió el dueño; esto asegura la proporción aunque llegue
 *    otra cosa.
 * 4. Lo escala a cada ancho y lo codifica en WebP con la calidad fija.
 *
 * GD no copia metadatos al codificar: las WebP salen sin EXIF, XMP ni ICC,
 * así que tampoco con la ubicación que traiga la foto.
 */
final class ImageProcessor
{
    /**
     * Las versiones WebP, por ancho.
     *
     * @return array<int, string>
     */
    public static function variants(string $path, string $mime, MediaKind $kind): array
    {
        if (! function_exists('imagewebp')) {
            throw new RuntimeException('GD con WebP no está instalado: la imagen de la app lo trae (Dockerfile).');
        }

        $image = self::open($path, $mime);
        $image = self::orient($image, $path, $mime);
        $cropped = self::crop($image, $kind);

        $variants = [];

        foreach ($kind->widths() as $width) {
            $height = max(1, $kind->heightFor($width));
            $canvas = imagecreatetruecolor(max(1, $width), $height);
            imagealphablending($canvas, false);
            imagesavealpha($canvas, true);
            imagecopyresampled($canvas, $cropped, 0, 0, 0, 0, $width, $height, imagesx($cropped), imagesy($cropped));

            ob_start();
            imagewebp($canvas, null, config()->integer('media.quality'));
            $variants[$width] = (string) ob_get_clean();
        }

        return $variants;
    }

    private static function open(string $path, string $mime): GdImage
    {
        $image = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($path),
            'image/png' => @imagecreatefrompng($path),
            'image/webp' => @imagecreatefromwebp($path),
            default => false,
        };

        if ($image === false) {
            throw new RuntimeException("No se pudo abrir la imagen ({$mime}).");
        }

        if (! imageistruecolor($image)) {
            imagepalettetotruecolor($image);
        }

        return $image;
    }

    /** Aplica la orientación del EXIF de un JPEG (necesita la extensión exif). */
    private static function orient(GdImage $image, string $path, string $mime): GdImage
    {
        if ($mime !== 'image/jpeg' || ! function_exists('exif_read_data')) {
            return $image;
        }

        $exif = @exif_read_data($path);
        $orientation = is_array($exif) && is_int($exif['Orientation'] ?? null) ? $exif['Orientation'] : 1;

        // imagerotate gira en sentido antihorario. Las transpuestas (5 y 7)
        // son un giro de 90° más el espejo horizontal.
        $rotated = match ($orientation) {
            3 => imagerotate($image, 180, 0),
            5, 6 => imagerotate($image, -90, 0),
            7, 8 => imagerotate($image, 90, 0),
            default => $image,
        };
        $rotated = $rotated === false ? $image : $rotated;

        match ($orientation) {
            2, 5, 7 => imageflip($rotated, IMG_FLIP_HORIZONTAL),
            4 => imageflip($rotated, IMG_FLIP_VERTICAL),
            default => true,
        };

        return $rotated;
    }

    /** El recorte centrado más grande con la proporción del tipo. */
    private static function crop(GdImage $image, MediaKind $kind): GdImage
    {
        [$ratioWidth, $ratioHeight] = $kind->ratio();
        $width = imagesx($image);
        $height = imagesy($image);

        $cropWidth = $width;
        $cropHeight = intdiv($width * $ratioHeight, $ratioWidth);

        if ($cropHeight > $height) {
            $cropHeight = $height;
            $cropWidth = intdiv($height * $ratioWidth, $ratioHeight);
        }

        if ($cropWidth === $width && $cropHeight === $height) {
            return $image;
        }

        $cropped = imagecrop($image, [
            'x' => intdiv($width - $cropWidth, 2),
            'y' => intdiv($height - $cropHeight, 2),
            'width' => max(1, $cropWidth),
            'height' => max(1, $cropHeight),
        ]);

        if ($cropped === false) {
            throw new RuntimeException('No se pudo recortar la imagen.');
        }

        return $cropped;
    }
}
