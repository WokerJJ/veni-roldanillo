<?php

namespace Tests\Support;

/**
 * Imágenes de prueba hechas aquí mismo (#113): ni fotos de nadie ni archivos
 * binarios en el repositorio.
 *
 * - png(): PNG en PHP puro (zlib y crc32), sin GD: sirve también donde GD no
 *   está instalado. La mitad izquierda de un color y la derecha de otro, para
 *   ver hacia dónde quedó el recorte.
 * - jpegWithExif(): JPEG con GD y un bloque EXIF escrito a mano, con la
 *   orientación y un texto que no debe aparecer en lo que se publica.
 * - jpegCornersWithExif(): lo mismo con una esquina de cada color.
 * - animatedWebpHeader(): la cabecera de una WebP animada.
 */
final class SyntheticImage
{
    /**
     * @param  array{int, int, int}  $left
     * @param  array{int, int, int}  $right
     */
    public static function png(int $width, int $height, array $left = [200, 30, 30], array $right = [30, 30, 200]): string
    {
        $half = intdiv($width, 2);
        $row = "\0".str_repeat(pack('C3', ...$left), $half).str_repeat(pack('C3', ...$right), $width - $half);

        return "\x89PNG\r\n\x1a\n"
            .self::chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0))
            .self::chunk('IDAT', (string) gzcompress(str_repeat($row, $height)))
            .self::chunk('IEND', '');
    }

    /** Un PNG que solo trae la cabecera: getimagesize lee las dimensiones sin abrirlo. */
    public static function pngHeaderOnly(int $width, int $height): string
    {
        return "\x89PNG\r\n\x1a\n".self::chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0));
    }

    /** Un JPEG (con GD) con EXIF: orientación y una descripción con $marker. */
    public static function jpegWithExif(int $width, int $height, int $orientation, string $marker): string
    {
        $image = imagecreatetruecolor($width, $height);
        imagefilledrectangle($image, 0, 0, intdiv($width, 2) - 1, $height - 1, (int) imagecolorallocate($image, 200, 30, 30));
        imagefilledrectangle($image, intdiv($width, 2), 0, $width - 1, $height - 1, (int) imagecolorallocate($image, 30, 30, 200));

        return self::withExif($image, $orientation, $marker);
    }

    /**
     * Un JPEG cuadrado (con GD) con una esquina de cada color, para ver los
     * espejos y las transposiciones: arriba a la izquierda rojo, arriba a la
     * derecha verde, abajo a la izquierda azul y abajo a la derecha blanco.
     */
    public static function jpegCornersWithExif(int $side, int $orientation): string
    {
        $image = imagecreatetruecolor($side, $side);
        $half = intdiv($side, 2);

        foreach ([[0, 0, [200, 30, 30]], [$half, 0, [30, 200, 30]], [0, $half, [30, 30, 200]], [$half, $half, [230, 230, 230]]] as [$x, $y, $rgb]) {
            imagefilledrectangle($image, $x, $y, $x + $half - 1, $y + $half - 1, (int) imagecolorallocate($image, ...$rgb));
        }

        return self::withExif($image, $orientation, 'esquinas');
    }

    /**
     * La cabecera de una WebP animada (VP8X con la bandera de animación y un
     * chunk ANIM): getimagesize lee el lienzo y finfo dice image/webp.
     */
    public static function animatedWebpHeader(int $width, int $height): string
    {
        $vp8x = 'VP8X'.pack('V', 10)."\x02\0\0\0".substr(pack('V', $width - 1), 0, 3).substr(pack('V', $height - 1), 0, 3);
        $anim = 'ANIM'.pack('V', 6).pack('V', 0).pack('v', 0);
        $body = 'WEBP'.$vp8x.$anim;

        return 'RIFF'.pack('V', strlen($body)).$body;
    }

    private static function withExif(\GdImage $image, int $orientation, string $marker): string
    {
        ob_start();
        imagejpeg($image, null, 90);
        $jpeg = (string) ob_get_clean();

        // TIFF big-endian: IFD0 con Orientation (0x0112) e ImageDescription (0x010E).
        $text = $marker."\0";
        $tiff = "MM\0\x2A".pack('N', 8)
            .pack('n', 2)
            .pack('nnNnn', 0x0112, 3, 1, $orientation, 0)
            .pack('nnNN', 0x010E, 2, strlen($text), 8 + 2 + 24 + 4)
            .pack('N', 0)
            .$text;
        $app1 = "Exif\0\0".$tiff;

        return substr($jpeg, 0, 2)."\xFF\xE1".pack('n', strlen($app1) + 2).$app1.substr($jpeg, 2);
    }

    private static function chunk(string $type, string $data): string
    {
        return pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
    }
}
