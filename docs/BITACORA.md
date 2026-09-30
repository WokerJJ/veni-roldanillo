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


## 2026-09-30 · Parte 2 · Frontend y calidad

- **#2 integrado:** Inertia v3 + Vue 3 + TypeScript estricto, Tailwind 4 con los tokens de `brand/` (sin copiar valores), fuentes variables autohospedadas (61 KB) y tema claro/oscuro sin destello que respeta la elección manual y se sincroniza entre pestañas.
- La revisión encontró que las grabaciones de Inertia DevTools (props y cabeceras de cada petición en local) se colaban en la imagen de producción; quedaron fuera y desactivadas. Con datos reales habría sido una fuga de datos personales.
- **#3 integrado:** Pest, Larastan en nivel 10 (empezar en el máximo cuesta poco con poco código), Pint y Vitest. El CI agrega backend, frontend, auditorías, gitleaks y actionlint en un único check `ci-ok`.
- `main` protegida: solo por PR, `ci-ok` obligatorio, historial lineal y sin force push. Agregar jobs nuevos no obliga a tocar la protección, porque todos pasan por `ci-ok`.
- Aprendizaje: una prueba que pasa por casualidad es peor que no tenerla. Las pruebas del tema ahora se escriben primero en rojo y corren en orden aleatorio.
- Anotado para después: nonce de CSP para el script del tema (#7) y fuentes con hash para la caché de la PWA (#5).
