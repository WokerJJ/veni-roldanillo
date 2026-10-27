# Decisiones de arquitectura (ADR)

Cada decisión importante queda en un archivo numerado con su contexto, la decisión y sus consecuencias. Una decisión no se reescribe: se reemplaza con un ADR nuevo y la anterior se marca como sustituida.

| ADR | Decisión | Estado |
| --- | --- | --- |
| [0001](0001-laravel-docker.md) | Laravel 13 con Docker en VPS | Sustituida en parte por 0012 |
| [0002](0002-inertia-vue.md) | Inertia + Vue 3 + TypeScript como PWA | Aceptada |
| [0003](0003-mapa-maplibre-pmtiles.md) | MapLibre + PMTiles autohospedado, sin API de Google Maps | Sustituida en parte por 0007 y 0008 |
| [0004](0004-pedidos-whatsapp.md) | Pedidos por WhatsApp sin comisión | Aceptada |
| [0005](0005-verificacion-resenas.md) | Reseñas verificadas con puntaje de confianza | Aceptada |
| [0006](0006-nombre-marca.md) | Nombre y marca: Vení Roldanillo | Aceptada |
| [0007](0007-mapa-desde-veni-mapa.md) | El mapa base se consume de las releases de veni-mapa | Aceptada |
| [0008](0008-ubicacion-y-rutas-en-el-dispositivo.md) | Ubicación del usuario y rutas calculadas en el dispositivo | Aceptada |
| [0009](0009-modelo-de-datos-inicial.md) | Modelo de datos inicial en PostgreSQL + PostGIS | Aceptada |
| [0010](0010-idioma-de-la-interfaz.md) | Idioma de la interfaz: resuelto en el servidor, textos en JSON compartidos con Vue | Aceptada |
| [0011](0011-iconos-colombia-icons.md) | Íconos: colombia-icons copiados desde una versión fija | Aceptada |
| [0012](0012-desarrollo-en-modo-clasico.md) | Desarrollo en modo clásico de FrankenPHP; Octane solo en producción | Aceptada |
| [0013](0013-entrega-por-imagen-versionada.md) | Entrega por imagen versionada: migración antes de arrancar, releases automáticas y despliegue a mano | Aceptada |
| [0014](0014-seguridad-http-detras-del-proxy.md) | Seguridad HTTP: TLS en el proxy de delante, proxies de confianza explícitos y CSP con nonce | Aceptada |
| [0015](0015-pwa-que-se-guarda-en-el-dispositivo.md) | PWA: qué se guarda en el dispositivo | Aceptada |
| [0016](0016-capas-propias-sobre-el-mapa.md) | Capas propias sobre el mapa: un registro en el motor y componentes dentro de `MapView` | Aceptada |
| [0017](0017-restaurantes-en-el-mapa.md) | Restaurantes en el mapa: GeoJSON público con caché corta y «abierto ahora» calculado en el dispositivo | Aceptada |
| [0018](0018-ficha-del-restaurante.md) | La ficha del restaurante: una dirección por slug, datos por lista blanca y el restaurante elegido en la dirección del mapa | Aceptada |
| [0019](0019-donde-estoy-en-el-mapa.md) | «¿Dónde estoy?»: el control de geolocalización de MapLibre, siguiendo la ubicación, con sus avisos dentro del mapa | Aceptada |
| [0020](0020-como-llegar-en-el-dispositivo.md) | «Cómo llegar»: el router de veni-mapa copiado del tag v0.2.0, el grafo bajado con la primera ruta y la posición solo dentro del motor | Aceptada |
| [0021](0021-locales-de-openstreetmap.md) | Locales de OpenStreetMap: borradores ocultos con su procedencia, bajo ODbL | Aceptada |
| [0022](0022-panel-de-abajo-en-el-celular.md) | El panel de abajo del celular: tres alturas, una manija propia y el resumen y la lista fuera del arranque | Aceptada |
| [0023](0023-opciones-y-quitar-ingredientes.md) | Opciones, adiciones y quitar ingredientes: un tipo de grupo, publicados por lista blanca y armados en el dispositivo | Aceptada |
| [0024](0024-carrito-y-pedido-por-whatsapp.md) | Carrito y pedido por WhatsApp: el mensaje se arma en el dispositivo, el carrito se guarda un día y la ubicación solo viaja en el texto que envía la persona | Aceptada |
| [0025](0025-panel-del-dueno-con-filament.md) | Panel del dueño con Filament: login propio sin registro, tenancy por restaurante y un perfil de CSP solo para `/panel` | Aceptada |
