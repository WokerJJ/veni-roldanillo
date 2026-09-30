# ADR 0003 · MapLibre + PMTiles autohospedado, sin API de Google Maps

**Estado:** aceptada; sustituida en parte por [0007](0007-mapa-desde-veni-mapa.md) y [0008](0008-ubicacion-y-rutas-en-el-dispositivo.md)

**Contexto:** Google Maps cobra por uso por encima de sus topes gratuitos y ata el proyecto a su facturación. El municipio es pequeño y el mapa se puede recortar.

**Decisión:** MapLibre GL JS con un extracto PMTiles de Roldanillo (OpenStreetMap vía Protomaps) alojado en Cloudflare R2, con estilo `@protomaps/basemaps` y recursos autohospedados. "Cómo llegar" abre Google Maps o Waze por enlace, sin API.

**Consecuencias:** costo cero por uso e independencia total. Requiere regenerar el extracto periódicamente y mostrar la atribución de OpenStreetMap.
