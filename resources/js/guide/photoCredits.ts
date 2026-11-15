/**
 * De dónde sale cada foto de la guía de platos típicos (#143, ADR 0045).
 *
 * Son fotos con licencia abierta de Wikimedia Commons (CC0, dominio público,
 * CC BY o CC BY-SA): la licencia pide nombrar a quien la hizo y dar la
 * licencia, y eso sale en cada tarjeta y en /credits. Las fotos de
 * resources/images/guia están recortadas a 4:3 y comprimidas (WebP, 480 y
 * 960 px de ancho): una adaptación, que con CC BY-SA se comparte bajo la misma
 * licencia.
 *
 * Solo datos, sin las direcciones de las imágenes: /credits los importa sin
 * traer las fotos (guide/photos.ts las trae para la guía).
 */
export interface PhotoLicense {
    /** Cómo se escribe: «CC BY-SA 4.0». */
    label: string;
    /** La licencia, para quien quiera leerla; sin dirección, el dominio público. */
    url: string | null;
}

export const LICENSES = {
    'cc-by-2.0': { label: 'CC BY 2.0', url: 'https://creativecommons.org/licenses/by/2.0/' },
    'cc-by-3.0': { label: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
    'cc-by-sa-2.0': { label: 'CC BY-SA 2.0', url: 'https://creativecommons.org/licenses/by-sa/2.0/' },
    'cc-by-sa-3.0': { label: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' },
    'cc-by-sa-4.0': { label: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    'public-domain': { label: 'Dominio público', url: null },
} as const satisfies Record<string, PhotoLicense>;

export type LicenseKey = keyof typeof LICENSES;

export interface PhotoCredit {
    /** El id del plato en la guía (lang/es/guide.php). */
    dish: string;
    /** Quién hizo la foto, como figura en Commons. */
    author: string;
    license: LicenseKey;
    /** El archivo en Wikimedia Commons, sin el prefijo `File:`. */
    file: string;
}

/** Wikimedia Commons: la página de un archivo, con su autor, licencia y descripción. */
export function sourceUrl(file: string): string {
    return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_'))}`;
}

export const PHOTO_CREDITS: readonly PhotoCredit[] = [
    { dish: 'sancocho-de-gallina', author: 'Daniestrella123', license: 'cc-by-sa-4.0', file: 'Sancocho de gallina yopal.jpg' },
    { dish: 'arroz-atollado', author: 'Olavia Kite', license: 'cc-by-2.0', file: 'Arroz atollado.jpg' },
    { dish: 'pandebono', author: 'El Mono Español', license: 'cc-by-sa-4.0', file: 'Pandebono 1 (comprada en la Panadería Colombia Viva, en Barcelona, España).jpg' },
    { dish: 'pandeyuca', author: 'Hoako', license: 'cc-by-sa-3.0', file: 'Pandeyuca, Pandebono y Almojábana. Colombia.JPG' },
    { dish: 'empanadas-vallunas', author: 'Francesc Fort', license: 'cc-by-sa-4.0', file: 'Empanada colombiana.jpg' },
    { dish: 'aborrajados', author: 'Ethnobotanical Historian', license: 'cc-by-sa-4.0', file: 'Aborrajados de plátano maduro.jpg' },
    { dish: 'marranitas', author: 'Remux', license: 'cc-by-sa-4.0', file: "Rue de l'art, Cali 35.jpg" },
    { dish: 'tamal', author: 'JOAN', license: 'cc-by-sa-4.0', file: 'Tamal tolimense abierto.jpg' },
    { dish: 'champus', author: 'Tory Stewart', license: 'cc-by-sa-2.0', file: 'Champus.jpg' },
    { dish: 'lulada', author: 'Caldobasico', license: 'cc-by-sa-4.0', file: 'Jugo de lulo.jpg' },
    { dish: 'cholado', author: 'C arango', license: 'public-domain', file: 'Cholado jamundi.jpg' },
    { dish: 'salpicon', author: 'Juan Gonzalo Angel (CocinaTV)', license: 'cc-by-3.0', file: 'Sirviendo salpicón de frutas.jpg' },
    { dish: 'chontaduro', author: 'Michael Hermann', license: 'cc-by-sa-3.0', file: 'Chontaduro (Bactris gasipaes) at Cali.JPG' },
    { dish: 'manjar-blanco', author: 'Remux', license: 'cc-by-sa-4.0', file: 'Manjar Blanco del Valle 01.jpg' },
];

const BY_DISH = new Map(PHOTO_CREDITS.map((credit) => [credit.dish, credit]));

/** El crédito de la foto de un plato, o null si no tiene foto (todavía). */
export function photoCredit(dish: string): PhotoCredit | null {
    return BY_DISH.get(dish) ?? null;
}
