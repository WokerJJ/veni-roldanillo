/**
 * Doble de `virtual:pwa-register` para Vitest. El módulo virtual lo crea
 * vite-plugin-pwa, que vitest.config.ts no carga: sin este alias, todo
 * componente que llega al registro (el layout, por el aviso de versión nueva)
 * fallaría al importarse. No registra nada; las pruebas del registro lo
 * reemplazan con vi.mock('virtual:pwa-register').
 */
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
    return () => Promise.resolve();
}
