# ADR 0007 · El mapa base se consume de las releases de veni-mapa

- Estado: aceptada
- Fecha: 2026-09-30
- Sustituye en parte: ADR 0003 (el extracto ya no se genera en la app).

## Contexto

La app necesita un mapa de Roldanillo sin la API de Google Maps ni servicios de pago. Generar el PMTiles, los estilos con la marca, las fuentes y los sprites es un pipeline propio, con su CI y su calendario (actualización mensual desde OpenStreetMap).

## Decisión

- El mapa base lo produce el repositorio [veni-mapa](https://github.com/WokerJJ/veni-mapa) y lo publica en releases versionadas: `roldanillo.pmtiles`, los estilos `veni-{claro,oscuro}-{es,en}.json`, glyphs, sprites, `roldanillo-rutas.json` y `manifest.json` con los SHA-256.
- La app lo consume por URL con `VITE_MAP_STYLE_URL` (estilo) y `VITE_MAP_ROUTES_URL` (grafo de rutas), apuntando a una versión fija (`https://tiles.veniroldanillo.co/vX.Y.Z/…`; mientras no esté R2, la demo de Pages).
- El tema (claro/oscuro) y el idioma los elige la app cambiando el nombre del estilo; el mapa no trae botones propios.
- Los restaurantes son una capa GeoJSON liviana que sirve la app desde su propia base de datos, encima del mapa base.
- MapLibre GL y PMTiles se cargan solo en las pantallas con mapa (carga perezosa).

## Consecuencias

- La app no guarda binarios del mapa en git ni corre el pipeline.
- Actualizar el mapa es cambiar la versión en la configuración y probar; una versión publicada no cambia de datos.
- La atribución "© colaboradores de OpenStreetMap" viene en la fuente del estilo y el control de atribución no se oculta.

## Nota de actualización (2026-10-03)

No cambia la decisión; la precisa el [ADR 0014](0014-seguridad-http-detras-del-proxy.md). La política de seguridad de contenido de la app solo deja pedir el mapa a los orígenes de `VITE_MAP_STYLE_URL` y `VITE_MAP_ROUTES_URL`, así que una release de veni-mapa tiene que servir el estilo, los tiles, los glyphs y el sprite desde el mismo origen que el estilo: una URL hacia otro host la bloquearía el navegador. veni-mapa lo verifica en su CI ([veni-mapa#62](https://github.com/WokerJJ/veni-mapa/issues/62)).
