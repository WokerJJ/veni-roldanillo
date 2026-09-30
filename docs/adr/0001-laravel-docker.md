# ADR 0001 · Laravel 13 con Docker en VPS

**Estado:** aceptada

**Contexto:** el autor domina Laravel y tiene experiencia en Linux e infraestructura. Se busca estabilidad, bajo costo y un proyecto que demuestre habilidades de desarrollo y DevOps.

**Decisión:** Laravel 13 sobre FrankenPHP/Octane, PostgreSQL + PostGIS y Meilisearch, todo en Docker Compose, desplegado en un VPS con GitHub Actions y Cloudflare delante.

**Consecuencias:** control total y portabilidad (el mismo compose sirve en local y producción). A cambio, el autor responde por actualizaciones, backups y seguridad del servidor.
