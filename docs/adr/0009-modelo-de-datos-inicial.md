# ADR 0009 · Modelo de datos inicial en PostgreSQL + PostGIS

- Estado: aceptada
- Fecha: 2026-09-30
- Sustituye en parte: `docs/04-seguridad-y-legal.md` (roles con spatie/laravel-permission queda diferido).

## Contexto

El modelo del borrador de `docs/03-arquitectura.md` tenía que convertirse en migraciones, modelos, factories y seeders (#6). Había que decidir cómo guardar la ubicación de los restaurantes, cómo representar estados y roles, y cómo evitar que los datos de ejemplo se confundan con datos reales.

## Decisión

- **Ubicación:** columna `geography(Point,4326)` con índice GiST, creada con el `Blueprint` de Laravel (`geography()` y `spatialIndex()`). Un cast propio (`AsGeoPoint` → `GeoPoint`) escribe EWKT y lee el EWKB que devuelve PostgreSQL. No se usa `clickbar/laravel-magellan`: solo hace falta un punto y un paquete más ata la actualización de Laravel a su calendario. Las consultas espaciales (`ST_DWithin`) se escriben con parámetros enlazados.
- **Estados y roles:** `varchar` con `CHECK` (lo que genera `enum()` en PostgreSQL) y enums PHP en los modelos. Más fácil de evolucionar que los tipos `ENUM` de PostgreSQL.
- **Roles:** rol global en `users.role` (user/admin) y dueño o empleado por restaurante en `restaurant_user.role`; la autorización va en Policies. spatie/laravel-permission se retoma cuando lleguen moderadores y paneles (#18, #19).
- **Integridad en la base:** FK con `onDelete` explícito (cascada para lo que cuelga del restaurante, `RESTRICT` para categorías y barrios en uso, `SET NULL` para que un usuario borrado deje sus intenciones de pedido anónimas), FK compuesta para que un plato no use la sección de otro restaurante y `CHECK` en precios, horarios y opciones.
- **Precios** en pesos enteros; **fechas** `timestamp with time zone` con la sesión en la zona de la aplicación.
- **Datos ficticios:** columna `is_fictitious` (el campo «ficticio» del issue #6, en inglés como el resto del código) y «(ficticio)» en el nombre; coordenadas inventadas dentro del casco urbano, WhatsApp imposible (`570…`) y correos `example.test`. El seeder no corre en producción.

## Consecuencias

- Sin dependencias nuevas; el cast solo entiende puntos (los polígonos de barrios se leerán con funciones de PostGIS cuando se usen).
- Añadir un valor a un estado requiere una migración que cambie el `CHECK`.
- Las pruebas corren sobre PostgreSQL/PostGIS real y verifican que las migraciones suben, bajan y vuelven a subir.
