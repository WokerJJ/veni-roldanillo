# ADR 0002 · Inertia + Vue 3 + TypeScript como PWA

**Estado:** aceptada

**Contexto:** la app debe ser rápida, liviana, instalable y funcionar con mala señal, sin mantener una API separada al inicio.

**Decisión:** Inertia con Vue 3 y TypeScript, Tailwind y `vite-plugin-pwa`. Vue por su curva más suave viniendo de Blade. Capacitor en fase 2 para tiendas de apps.

**Consecuencias:** un solo proyecto y un solo despliegue. Si en el futuro se necesita una API pública, se agrega con Sanctum sin reescribir el frontend.
