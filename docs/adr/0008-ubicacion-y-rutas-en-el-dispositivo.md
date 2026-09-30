# ADR 0008 · Ubicación del usuario y rutas calculadas en el dispositivo

- Estado: aceptada
- Fecha: 2026-09-30
- Sustituye en parte: ADR 0003 ("Cómo llegar" solo por enlace) y amplía la regla de producto 3 (ubicación).

## Contexto

Mostrar dónde está la persona y la ruta hasta un restaurante hace la app más útil, sobre todo para turistas. Las opciones eran un motor de rutas propio en el servidor (OSRM), solo enlaces a Google Maps/Waze, o calcular la ruta en el teléfono.

## Decisión

- **Ubicación:** control de geolocalización de MapLibre. El permiso se pide solo al tocar «¿Dónde estoy?». La posición se usa en el dispositivo y **nunca se envía al servidor** ni queda en la URL.
- **Ruta:** al tocar un restaurante se calcula en el navegador con el router de referencia de veni-mapa (`scripts/routing/router.ts` del tag de la versión) sobre `roldanillo-rutas.json`, que se descarga recién al pedir la primera ruta (~215 KB con gzip). Perfiles a pie y en vehículo.
- **Navegación paso a paso:** se mantiene el botón «Abrir en Google Maps / Waze» por enlace.

## Consecuencias

- Sin servidor de rutas ni costos; funciona con mala señal una vez descargado el grafo (caché de la PWA).
- La regla de producto 3 sigue vigente para la verificación de visitas (en el servidor solo el resultado, nunca coordenadas) y se extiende: la ubicación para rutas tampoco sale del dispositivo.
- La ruta es una estimación (sin giros prohibidos ni tráfico); los mensajes lo dicen.
