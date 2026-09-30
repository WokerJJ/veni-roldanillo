# Roadmap y alcance del MVP

## Fase 0 · Base técnica

- [ ] Proyecto Laravel 13 + Docker Compose (app, worker, scheduler, db PostGIS, meilisearch)
- [ ] Inertia + Vue 3 + TypeScript + Tailwind con tokens de marca y fuentes autohospedadas
- [ ] Pest, Larastan, Pint, ESLint, vue-tsc y workflow de GitHub Actions
- [ ] i18n ES/EN configurado (backend y frontend)
- [ ] PWA: manifest con íconos de `brand/png`, service worker, modo sin conexión básico
- [ ] Modelo de datos inicial, factories y seeders con datos ficticios

## Fase 1 · MVP

- [ ] Inicio: búsqueda, filtros (abierto ahora, domicilio, precio, categoría), "Almuerzos de hoy", "Sugiéreme algo"
- [ ] Ficha del restaurante: datos, horarios con estado abierto/cerrado, menú por secciones
- [ ] Menú con opciones obligatorias, adiciones, quitar ingredientes y nota
- [ ] Carrito y mensaje de WhatsApp (barrio, dirección, referencia, ubicación opcional, pago, "¿con cuánto pagás?")
- [ ] Direcciones y favoritos guardados en el dispositivo
- [ ] Mapa de veni-mapa (ADR 0007) con capa de restaurantes, ubicación del usuario y ruta en el dispositivo (ADR 0008)
- [ ] Búsqueda por plato con Meilisearch
- [ ] Panel de dueño (Filament): ficha, menú, agotado hoy, promociones, horarios especiales, aviso de demora
- [ ] Panel de administración: alta de restaurantes, reclamación de fichas, moderación
- [ ] "¿Es tu negocio? Reclámalo" y retiro de ficha
- [ ] Guía de platos típicos (ES/EN)
- [ ] Registro de clics en "Pedir por WhatsApp" (order_intents) y estadísticas básicas del dueño
- [ ] Páginas legales: tratamiento de datos, términos, política de reseñas

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
