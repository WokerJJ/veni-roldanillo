/**
 * Contrato de las capas propias de la app sobre el mapa base (ADR 0016).
 *
 * Solo tipos: de MapLibre toma su especificación de estilo, que no pesa en el
 * bundle. Quien pinta algo sobre el mapa (restaurantes, y después la
 * ubicación y la ruta) lo describe con un `MapLayerGroup` y lo registra con
 * `useMapLayers()` (resources/js/map/useMapLayers.ts) desde un componente
 * puesto dentro de `<MapView>`. El motor (resources/js/map/engine.ts) guarda el
 * registro y lo vuelve a poner cada vez que el mapa cambia de estilo.
 */
import type { GeoJSONSourceSpecification, LayerSpecification } from 'maplibre-gl';

/** Lo que acepta una fuente GeoJSON como datos. */
export type MapGeoJson = GeoJSON.GeoJSON;

/**
 * Imagen para `icon-image`, ya decodificada: el motor no descarga nada. Como
 * los sprites, `pixelRatio` dice cuántos píxeles de la imagen son uno de la
 * pantalla.
 */
export interface MapImage {
    data: HTMLImageElement | ImageBitmap | ImageData;
    pixelRatio?: number;
}

/** La figura de una capa que alguien tocó. */
export interface MapHit {
    /** Id de la capa (una de `interaction.layers`). */
    layer: string;
    /**
     * Propiedades de la figura. MapLibre solo devuelve valores simples: una
     * lista o un objeto llegan como texto JSON. Lo usual es traer un
     * identificador y buscar el resto en los datos propios.
     */
    properties: Readonly<Record<string, unknown>>;
    /** `[longitud, latitud]` si la figura es un punto. */
    coordinates: [number, number] | null;
}

/**
 * Un grupo de capas propias: sus fuentes GeoJSON, las capas que las pintan y
 * las imágenes que usan.
 *
 * Los ids de fuentes, capas e imágenes empiezan por el `id` del grupo
 * (`restaurants`, `restaurants-clusters`…): así no chocan con los del mapa
 * base ni con los de otro grupo. El motor lo exige.
 */
export interface MapLayerGroup {
    id: string;
    /**
     * Altura del grupo entre los demás: se pinta encima de los que tienen un
     * número menor (la ruta va debajo de los restaurantes). Con el mismo
     * número, encima el que se registró después. Todos van sobre el mapa base.
     */
    order?: number;
    /** Los datos de cada fuente son los iniciales: después se cambian con `setData`. */
    sources: Readonly<Record<string, GeoJSONSourceSpecification>>;
    /** En el orden en que se pintan: la última queda encima. */
    layers: readonly LayerSpecification[];
    images?: Readonly<Record<string, MapImage>>;
    /**
     * Capas que se pueden tocar. El área táctil de cada figura mide 44 px
     * (regla 9 de producto) aunque se dibuje más chica; si hay varias cerca,
     * gana la más próxima al toque.
     */
    interaction?: {
        layers: readonly string[];
        onSelect: (hit: MapHit) => void;
    };
}

/** Lo que devuelve el motor al registrar un grupo. */
export interface MapLayerGroupHandle {
    /** Cambia los datos de una fuente del grupo; siguen ahí tras un cambio de estilo. */
    setData(sourceId: string, data: MapGeoJson): void;
    /** Acerca el mapa hasta que un grupo de puntos (`cluster: true`) se separa. */
    expandCluster(sourceId: string, clusterId: number, center: [number, number]): void;
    /** Quita del mapa las fuentes, las capas y las imágenes del grupo. */
    remove(): void;
}
