// Solo el tipo: los nombres salen del manifiesto y el JSON no entra al bundle.
import type manifest from '../../icons/colombia/manifest.json';

/**
 * Nombres de los íconos copiados de colombia-icons (ADR 0011): las claves de
 * «icons» del manifiesto. Agregar un ícono al manifiesto lo agrega al tipo.
 */
export type IconName = keyof (typeof manifest)['icons'];

/** Un SVG listo para pintar: los atributos de su raíz y el dibujo de adentro. */
export interface IconArt {
    readonly attributes: Readonly<Record<string, string>>;
    readonly body: string;
}

/*
| Los íconos del layout viajan en el bundle inicial: están en todas las
| páginas y, si llegaran después, el encabezado parpadearía. El resto es un
| chunk por ícono que se pide la primera vez que una página lo pinta, así el
| set puede crecer sin que crezca la primera carga.
|
| Los patrones de import.meta.glob tienen que ser literales: la lista de los
| críticos se repite, negada, en el segundo.
*/
const critical = import.meta.glob<string>('./{idioma,luna,sol}.svg', {
    base: '../../icons/colombia',
    eager: true,
    query: '?raw',
    import: 'default',
});

const onDemand = import.meta.glob<string>(['./*.svg', '!./{idioma,luna,sol}.svg'], {
    base: '../../icons/colombia',
    query: '?raw',
    import: 'default',
});

/** El tamaño lo pone el componente; el espacio de nombres, Vue al crear el <svg>. */
const SET_BY_COMPONENT = new Set(['xmlns', 'width', 'height']);

const parsed = new Map<IconName, IconArt>();

/** Clave del ícono en los dos mapas: su archivo, relativo a `base`. */
function file(name: IconName): string {
    return `./${name}.svg`;
}

/**
 * Separa la raíz del dibujo. La forma del archivo (una raíz <svg> con
 * atributos entre comillas dobles) la garantiza `icons-sync.mjs --check`.
 */
function parse(name: IconName, svg: string): IconArt {
    const [, root, body] = /^<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(svg) ?? [];

    if (root === undefined || body === undefined) {
        throw new Error(`El archivo del ícono «${name}» no es un SVG.`);
    }

    const attributes: Record<string, string> = {};

    for (const [, attribute, value] of root.matchAll(/([\w:-]+)="([^"]*)"/g)) {
        if (attribute !== undefined && value !== undefined && !SET_BY_COMPONENT.has(attribute)) {
            attributes[attribute] = value;
        }
    }

    const art: IconArt = { attributes, body: body.trim() };
    parsed.set(name, art);

    return art;
}

/** El ícono, si se puede pintar ya: es del bundle inicial o ya se pidió antes. */
export function readyIcon(name: IconName): IconArt | undefined {
    const known = parsed.get(name);

    if (known) {
        return known;
    }

    const svg = critical[file(name)];

    return svg === undefined ? undefined : parse(name, svg);
}

/** El ícono, pidiendo su chunk si hace falta. Falla si no existe o si no hay red. */
export async function loadIcon(name: IconName): Promise<IconArt> {
    const ready = readyIcon(name);

    if (ready) {
        return ready;
    }

    const load = onDemand[file(name)];

    if (!load) {
        throw new Error(`No existe el ícono «${name}».`);
    }

    return parse(name, await load());
}
