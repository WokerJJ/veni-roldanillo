# Cómo contribuir

Este es un proyecto de portafolio con todos los derechos reservados (ver [LICENSE](LICENSE)). Se reciben reportes de errores y sugerencias por issues.

## Flujo de trabajo

1. Todo cambio parte de un issue con criterios de aceptación.
2. Rama desde `main`: `feat/<n>-<descripcion>`, `fix/<n>-…`, `chore/<n>-…`, `docs/<n>-…`.
3. Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) en español que referencian el issue:
   `feat(carrito): adiciones y nota por plato (#12)`.
4. PR con la plantilla y `Closes #N`. Requiere CI en verde y revisión.
5. Squash merge; la rama se borra al fusionar.

`main` está protegida: solo se modifica por PR.

## Idioma

Documentación, commits e issues en español. Código (clases, variables, tablas, rutas) en inglés. Todo texto visible pasa por los archivos de idioma `lang/es.json` y `lang/en.json`, con claves con puntos (`home.title`) y las mismas claves en los dos (ADR 0010).

## Decisiones

Las decisiones de arquitectura se registran en [`docs/adr/`](docs/adr/). Cambiar una decisión requiere un ADR nuevo.
