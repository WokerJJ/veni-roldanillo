/*
| Qué guarda el service worker al instalarse (#5): el shell, lo que baja al
| abrir la app sin pedir nada con import(). Lo usa vite.config.ts al compilar,
| en Node: sin DOM ni dependencias.
|
| La lista sale del directorio de build (Workbox recorre public/build/assets)
| y el manifest de Vite solo dice cuáles de esos archivos son el shell: en el
| manifest hay nombres que no son archivos (el worker del mapa queda en
| `assets` con el hash sin resolver, resources/js/map/bundle.test.ts).
*/

/** Una entrada del manifest de Vite (public/build/manifest.json). */
export interface ViteManifestChunk {
    file: string;
    css?: string[];
    imports?: string[];
    dynamicImports?: string[];
    assets?: string[];
}

export type ViteManifest = Record<string, ViteManifestChunk>;

/**
 * Lo que el navegador baja con estas entradas sin pedir nada con import():
 * su archivo, sus imports estáticos en cadena y los CSS y assets (el logo) de
 * todos ellos. Rutas relativas al directorio de build (`assets/app-….js`).
 */
export function staticFiles(manifest: ViteManifest, entries: readonly string[]): string[] {
    const files = new Set<string>();
    const seen = new Set<string>();
    const queue = [...entries];

    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        const chunk = manifest[key];

        if (!chunk) {
            throw new Error(`El manifest de Vite no tiene «${key}».`);
        }

        files.add(chunk.file);
        chunk.css?.forEach((file) => files.add(file));
        chunk.assets?.forEach((file) => files.add(file));
        queue.push(...(chunk.imports ?? []));
    }

    return [...files].sort();
}

/**
 * Deja del precache de Workbox solo las URL del shell, en el orden en que
 * vienen. Falla si al shell le falta alguna: el archivo no está en el
 * directorio de build (un nombre sin resolver o un patrón de búsqueda que no
 * lo alcanza) y el service worker no se podría instalar.
 */
export function keepShell<Entry extends { url: string }>(entries: readonly Entry[], shellUrls: readonly string[]): Entry[] {
    const urls = new Set(entries.map((entry) => entry.url));
    const missing = shellUrls.filter((url) => !urls.has(url));

    if (missing.length > 0) {
        throw new Error(`El shell de la PWA nombra archivos que no están en el build: ${missing.join(', ')}`);
    }

    const shell = new Set(shellUrls);

    return entries.filter((entry) => shell.has(entry.url));
}
