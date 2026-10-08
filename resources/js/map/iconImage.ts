import type { IconArt } from '@/icons/icons';

import type { MapImage } from './layers';

/** Hasta cuántos píxeles por punto se dibuja: más no se nota y pesa en memoria. */
const MAX_PIXEL_RATIO = 3;

/**
 * El SVG de un ícono de colombia-icons, de un color fijo: dentro del mapa no
 * hay texto del que heredar `currentColor`.
 */
export function iconSvg(art: IconArt, pixels: number, color: string): string {
    const attributes = Object.entries(art.attributes)
        .map(([name, value]) => `${name}="${value}"`)
        .join(' ');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(pixels)}" height="${String(pixels)}" ${attributes}>${art.body}</svg>`.replaceAll(
        'currentColor',
        color,
    );
}

/**
 * Un ícono como imagen para una capa del mapa (`icon-image`), de `size` px en
 * pantalla y nítido en pantallas densas. El navegador lo dibuja desde una URL
 * `data:` (la CSP las admite en `img-src`, ADR 0014): no sale a la red. Se
 * rechaza si el navegador no puede decodificarlo.
 */
export async function iconImage(art: IconArt, { size, color }: { size: number; color: string }): Promise<MapImage> {
    const pixelRatio = Math.min(Math.max(Math.ceil(window.devicePixelRatio), 1), MAX_PIXEL_RATIO);
    const pixels = size * pixelRatio;
    const image = new Image(pixels, pixels);

    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(art, pixels, color))}`;
    await image.decode();

    return { data: image, pixelRatio };
}
