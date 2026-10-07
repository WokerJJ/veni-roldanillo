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

## 2026-10-01 · Parte 3 · Datos e idiomas

- **#6 integrado:** modelo de datos de la Fase 1 sobre PostgreSQL + PostGIS (ADR 0009). La integridad vive en la base: FK compuesta plato-sección, CHECK de WhatsApp colombiano y precios en pesos enteros, y `EXCLUDE` con `btree_gist` para que un día no quede «cerrado y abierto».
- Tres revisiones (técnica, seguridad y datos con `EXPLAIN` sobre una base desechable) encontraron 19 observaciones. La más seria: los seeders hijos podían correr en producción y crear un admin con contraseña conocida; ahora todos se niegan fuera de `local` y `testing`.
- Decisiones del modelo: varias categorías por restaurante (pivote), una Policy común para todo el contenido que edita el dueño y anonimización real al borrar una cuenta (trigger que anula `user_id` y `device_hash`).
- **#4 integrado:** español e inglés con el idioma resuelto en el servidor (ADR 0010): `?lang`, cookie, cuenta, `Accept-Language`. Una sola fuente de textos para Laravel y Vue, `t()` tipada y sin dependencias nuevas. Una cuenta sin idioma elegido sigue al dispositivo.
- Aprendizajes: una prueba no debe modificar objetos compartidos de la base (quitaba PostGIS y en CI fallaba; ahora usa una base temporal desde `template0`). Una migración ya publicada no se edita: se corrige con otra.
- Encontrado al levantar una demo: el modo desarrollo en Windows es muy lento con `vendor/` montado (#32). La imagen de producción responde en 0,4 s.
- Nuevo: los íconos de la interfaz saldrán de [colombia-icons](https://github.com/Mteheran/colombia-icons) (MIT), en curso en #34. La PWA (#5) pasa a la parte 4.

## 2026-10-02 · Parte 4 · Íconos, desarrollo rápido y el mapa en la app

- **#34 integrado:** los íconos de la interfaz salen de [colombia-icons](https://github.com/Mteheran/colombia-icons) (MIT, ADR 0011). Se copian solo los que se usan, desde una versión fija, con un manifiesto de sha256 y una lista blanca que valida cada SVG antes de insertarlo.
- **#32 integrado:** el entorno de desarrollo en Windows pasó de 5 s a 1 s por página y de 268 s a 68 s en las pruebas (ADR 0012). La causa era Octane arrancando 24 procesos sobre `vendor/` montado desde Windows. Desarrollo corre en modo clásico; producción sigue con Octane.
- **#8 integrado:** el inicio de la app muestra el mapa de Roldanillo que publica veni-mapa, a pantalla completa, en el tema y el idioma elegidos. El motor del mapa se descarga solo donde hay mapa.
- La revisión del mapa encontró que «Reintentar» no recuperaba el mapa si el archivo de datos fallaba una vez. Se corrigió con una prueba sobre la librería real, no sobre un doble.
- Aprendizajes: una prueba puede pasar en local y fallar en CI por depender de archivos compilados o de cómo se detecta el entorno; conviene correrlas también con `CI=true`. Una URL de configuración mal formada debe detener la compilación, no fallar en silencio.

## 2026-10-07 · Parte 5 · Cierre de las bases

- **#7 integrado:** imagen de producción lista para desplegar, con una prueba de humo en CI que la levanta con Octane (ADR 0013). Versiones con release-please. El despliegue queda preparado y desactivado, sin ninguna clave real.
- **#41 integrado:** seguridad HTTP detrás del proxy (ADR 0014): proxies de confianza cerrados por defecto, cookies seguras, cabeceras y una CSP con nonce sin `'unsafe-inline'`. La revisión encontró que la app aceptaba el host que enviara el cliente en las cabeceras del proxy; ahora solo acepta el de `APP_URL`.
- **#5 integrado:** Vení se instala en el celular y abre sin señal (ADR 0015). Las páginas nunca se guardan en el dispositivo, porque dependen del idioma y de la sesión; sí se guardan el shell, las fuentes, los íconos y el estilo del mapa.
- **#50 integrado:** dos vulnerabilidades nuevas en dependencias de desarrollo frenaron el CI. Una llegaba por una herramienta del esqueleto de Laravel que no se usaba: se quitó.
- Decisión de orden: el issue #7 se partió en dos (entrega y seguridad) para revisarlos por separado.
- Aprendizajes: la auditoría de dependencias dentro del check obligatorio detiene todo cuando se publica un aviso, y eso es lo que se quiere, pero conviene correrla antes de subir. Los archivos de bloqueo en conflicto se regeneran, no se mezclan a mano.
- Con esto quedan cerradas las bases de la Fase 0. Sigue el producto: restaurantes sobre el mapa (#9), ficha (#13), ubicación (#10) y ruta (#11).
