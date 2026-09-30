# Bitácora

Diario de avance del proyecto: qué se hizo en cada bloque, decisiones y aprendizajes.

## 2026-09-30 · Arranque

- Repositorio con licencia, plantillas de issues y PR, CODEOWNERS, Dependabot, política de seguridad y guía de contribución.
- ADR 0007 (mapa desde las releases de veni-mapa) y 0008 (ubicación y rutas en el dispositivo); 0003 queda sustituida en parte.
- El mapa se integrará con la release **v0.2.0** de veni-mapa (estilos, PMTiles y grafo de rutas).
- Repositorio público con labels por área, milestones de las cinco fases, tablero y los 23 issues de las fases 0 y 1 con criterios de aceptación.

## 2026-09-30 · Parte 1 · Base técnica

- **#1 integrado:** Laravel 13 con Octane sobre FrankenPHP y Docker Compose (app, worker, scheduler, PostgreSQL + PostGIS, Meilisearch). Un solo `docker-compose.yml` para producción y un override solo para local.
- Las pruebas corren sobre PostgreSQL con PostGIS (base `veni_test`), no sobre SQLite: el mismo motor que producción evita falsos verdes con consultas geográficas.
- `/up` revisa la base y la `APP_KEY`, para que el healthcheck no dé «sano» con la app rota.
- Quedan anotados para el despliegue (#7): HTTPS y proxies de confianza, `php artisan optimize` y un servicio de migración.
- **#2 en revisión:** Inertia + Vue 3 + TypeScript estricto, Tailwind con los tokens de la marca y fuentes autohospedadas. Las correcciones de la revisión siguen en la parte 2.
- Orden: #2 va antes que #3, porque el CI necesita el frontend para correr ESLint y vue-tsc.

