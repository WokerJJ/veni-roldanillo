/**
 * Las fotos de la guía de platos típicos (#143, ADR 0045): por cada plato,
 * una a 480 y otra a 960 px de ancho, en resources/images/guia, que Vite
 * compila con el hash en el nombre (así la caché del service worker nunca
 * guarda una vieja: una foto nueva es otra dirección). De quién es cada una,
 * en guide/photoCredits.ts.
 */
export interface GuidePhoto {
    src: string;
    srcset: string;
}

const URLS = import.meta.glob<string>('../../images/guia/*.webp', { eager: true, query: '?url', import: 'default' });

/** `sancocho-de-gallina-480.webp` → `sancocho-de-gallina` y 480. */
const NAME = /\/([a-z-]+)-(480|960)\.webp$/;

const PHOTOS = new Map<string, { 480?: string; 960?: string }>();

for (const [path, url] of Object.entries(URLS)) {
    const match = NAME.exec(path);
    const id = match?.[1];
    const width = match?.[2];

    if (id !== undefined && (width === '480' || width === '960')) {
        PHOTOS.set(id, { ...PHOTOS.get(id), [width]: url });
    }
}

/** La foto de un plato (su id en la guía), o null si no tiene: la tarjeta muestra su ícono. */
export function guidePhoto(dish: string): GuidePhoto | null {
    const sizes = PHOTOS.get(dish);

    if (sizes?.[480] === undefined || sizes[960] === undefined) {
        return null;
    }

    return { src: sizes[960], srcset: `${sizes[480]} 480w, ${sizes[960]} 960w` };
}

/** Los ids de los platos que tienen foto, en el orden de las fotos. */
export function photographedDishes(): string[] {
    return [...PHOTOS.keys()].filter((id) => guidePhoto(id) !== null);
}
