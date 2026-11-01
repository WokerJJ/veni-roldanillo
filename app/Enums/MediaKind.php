<?php

namespace App\Enums;

use App\Models\Dish;
use App\Models\Promotion;
use Illuminate\Database\Eloquent\Model;

/**
 * Los dos tipos de imagen que sube un dueño (#113, ADR 0034): la foto de un
 * plato, cuadrada, y la imagen de una promoción, 16:9. Cada uno con sus tres
 * anchos (miniatura, tarjeta y grande), la columna donde queda su clave y el
 * mínimo que se acepta del recorte.
 */
enum MediaKind: string
{
    case Dish = 'dishes';
    case Promotion = 'promotions';

    /** @return class-string<Model> */
    public function model(): string
    {
        return match ($this) {
            self::Dish => Dish::class,
            self::Promotion => Promotion::class,
        };
    }

    /** La columna con la clave de la imagen procesada (MediaStore). */
    public function column(): string
    {
        return match ($this) {
            self::Dish => 'photo_path',
            self::Promotion => 'image_path',
        };
    }

    /**
     * Proporción: ancho y alto.
     *
     * @return array{int, int}
     */
    public function ratio(): array
    {
        return match ($this) {
            self::Dish => [1, 1],
            self::Promotion => [16, 9],
        };
    }

    /** La proporción como la escribe el editor de recorte de Filament. */
    public function ratioLabel(): string
    {
        [$width, $height] = $this->ratio();

        return "{$width}:{$height}";
    }

    /**
     * Los anchos que se guardan, de menor a mayor.
     *
     * @return list<int>
     */
    public function widths(): array
    {
        return match ($this) {
            self::Dish => [160, 480, 960],
            self::Promotion => [320, 640, 1280],
        };
    }

    /** Alto de un ancho, con la proporción del tipo. */
    public function heightFor(int $width): int
    {
        [$ratioWidth, $ratioHeight] = $this->ratio();

        return intdiv($width * $ratioHeight, $ratioWidth);
    }

    /** El ancho que va en `src` (el de en medio): el que pide un navegador sin srcset. */
    public function defaultWidth(): int
    {
        return $this->widths()[1];
    }

    /**
     * Lado corto mínimo del original: hasta el tamaño grande se agranda como
     * mucho al doble.
     */
    public function minShortSide(): int
    {
        return intdiv($this->heightFor($this->widths()[2]), 2);
    }
}
