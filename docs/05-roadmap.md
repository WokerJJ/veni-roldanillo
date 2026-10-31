# Roadmap y alcance del MVP

## Fase 0 · Base técnica

Cerrada: versión 0.1.0.

- [x] Proyecto Laravel 13 + Docker Compose (app, worker, scheduler, db PostGIS, meilisearch)
- [x] Inertia + Vue 3 + TypeScript + Tailwind con tokens de marca y fuentes autohospedadas
- [x] Pest, Larastan, Pint, ESLint, vue-tsc y workflow de GitHub Actions
- [x] i18n ES/EN configurado (backend y frontend)
- [x] PWA: manifest con íconos de `brand/png`, service worker, modo sin conexión básico
- [x] Modelo de datos inicial, factories y seeders con datos ficticios
- [x] Imagen de producción en GHCR con prueba de humo en CI, releases con release-please y despliegue preparado (desactivado hasta que exista el servidor)
- [x] Seguridad HTTP en producción: proxies de confianza, cookies seguras, cabeceras y CSP

## Fase 1 · MVP

- [x] Inicio: búsqueda, filtros (abierto ahora, domicilio, precio, categoría), "Almuerzos de hoy", "Sugiéreme algo" (#12, ADR 0028). Pendiente: publicar el almuerzo del día desde el panel del dueño
- [x] Ficha del restaurante: datos, horarios con estado abierto/cerrado, menú por secciones (ADR 0018)
- [x] Menú con opciones obligatorias, adiciones, quitar ingredientes y nota (ADR 0023)
- [x] Carrito y mensaje de WhatsApp (barrio, dirección, referencia, ubicación opcional, pago, "¿con cuánto pagás?") (ADR 0024)
- [x] Direcciones y favoritos guardados en el dispositivo: libreta para todos los restaurantes, favoritos en la ficha y el resumen, «Tus favoritos» en la lista y «Borrar todo lo guardado» (#16, ADR 0032). Pendiente: filtro «Favoritos» en el mapa
- [x] Mapa de veni-mapa en el inicio (ADR 0007)
- [x] Restaurantes sobre el mapa, con su resumen y el estado «abierto ahora» (ADR 0016 y 0017)
- [x] Locales de OpenStreetMap como fichas ocultas para verificar en la calle, con su atribución en `/credits` (#58, ADR 0021)
- [x] Ubicación del usuario y ruta en el dispositivo (ADR 0008, 0019 y 0020)
- [x] Panel de abajo en el celular, con tres alturas y panel lateral con poco alto (#81, ADR 0022)
- [x] Búsqueda por plato con Meilisearch, agrupada por restaurante y combinada con los filtros del inicio (#17, ADR 0029)
- [x] Panel de dueño (Filament): ficha, menú, agotado hoy, promociones, horarios especiales, aviso de demora (#18, ADR 0025); sin pisar cambios de otra pestaña (ADR 0027). Pendiente: pin de ubicación, fotos de platos, categorías, 2FA
- [x] Panel de administración: alta de restaurantes, borradores de OpenStreetMap, reclamos y retiros, ocultar y mostrar fichas (#19, ADR 0027). Pendiente: moderación de reseñas (con #21), registro de cambios, 2FA
- [x] "¿Es tu negocio? Reclámalo" y retiro de ficha (#20, ADR 0026)
- [x] Guía de platos típicos (ES/EN) en `/dishes`, con un enlace por plato a la búsqueda del inicio (#21, patrón del ADR 0030)
- [x] Registro de clics en "Pedir por WhatsApp" (order_intents, sin identificador) y estadísticas básicas del dueño (#22, ADR 0031). Pendiente: «¿Al final sí pediste?»
- [x] Páginas legales: tratamiento de datos, términos, política de reseñas (#23, ADR 0030; borradores pendientes de revisión jurídica)

## Piloto

- [ ] Carga de todos los restaurantes del casco urbano
- [ ] Prueba con restaurantes aliados; medir clics, uso y actualizaciones

## Fase 2 · Confianza

- [ ] Registro con código por WhatsApp y passkeys
- [ ] Flujo "¿Al final sí pediste?" y reseñas con etiquetas dinámicas y 👍/👎 por plato
- [ ] Verificación por ubicación (precisión + permanencia)
- [ ] Stickers NFC NTAG 424 DNA + QR con validación SUN/CMAC
- [ ] Puntaje de confianza, promedio bayesiano, moderación de sospechosos
- [ ] Canal privado de quejas y respuestas del dueño
- [ ] App en tiendas con Capacitor (detección de GPS falso, Play Integrity)

## Fase 3 · Expansión

- [ ] Otros negocios (heladerías, panaderías, cholados)
- [ ] Rutas gastronómicas turísticas y eventos del municipio
- [ ] Reportes agregados y anónimos para medición turística
- [ ] Contribución de datos de Roldanillo a OpenStreetMap

## Indicadores

Restaurantes publicados (meta 100 % del casco urbano), fichas reclamadas, fichas actualizadas en el último mes, usuarios activos semanales, clics en "Pedir por WhatsApp", uso en inglés, reseñas verificadas.
