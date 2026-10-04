import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ServiceWorkerModule from './serviceWorker';

/*
| El módulo virtual de vite-plugin-pwa, simulado: guarda las opciones con que
| se registró y devuelve la función que activa la versión que espera.
*/
const activate = vi.fn<(reloadPage?: boolean) => Promise<void>>(() => Promise.resolve());
const registerSW = vi.fn<(options?: RegisterSWOptions) => typeof activate>(() => activate);

vi.mock('virtual:pwa-register', () => ({ registerSW }));

/** Copia nueva del módulo: el estado del aviso es de módulo. */
async function load(): Promise<typeof ServiceWorkerModule> {
    vi.resetModules();

    return import('./serviceWorker');
}

/** Las opciones del último registro. */
function registeredWith(): RegisterSWOptions {
    const options = registerSW.mock.lastCall?.[0];

    if (options === undefined) {
        throw new Error('No se registró el service worker.');
    }

    return options;
}

beforeEach(() => {
    registerSW.mockClear();
    activate.mockClear();
    // happy-dom no trae serviceWorker; un navegador que lo soporta, sí.
    vi.stubGlobal('navigator', { serviceWorker: {} });
});

describe('registro del service worker', () => {
    it('lo registra una vez, por el módulo de vite-plugin-pwa', async () => {
        const { registerServiceWorker } = await load();

        registerServiceWorker();

        expect(registerSW).toHaveBeenCalledOnce();
        // Sin `immediate`: Workbox espera al evento load y no compite con la primera carga.
        expect(registeredWith().immediate).toBeUndefined();
    });

    it('en un navegador sin service workers no hace nada', async () => {
        vi.stubGlobal('navigator', {});
        const { registerServiceWorker } = await load();

        registerServiceWorker();

        expect(registerSW).not.toHaveBeenCalled();
    });

    it('si el registro falla, avisa en la consola y la app sigue', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();

        expect(() => registeredWith().onRegisterError?.(new Error('sin red'))).not.toThrow();
        expect(warn).toHaveBeenCalledOnce();
        expect(useServiceWorker().updateReady.value).toBe(false);
    });
});

describe('aviso de versión nueva', () => {
    it('aparece cuando una versión nueva queda esperando', async () => {
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        const { updateReady } = useServiceWorker();

        expect(updateReady.value).toBe(false);

        registeredWith().onNeedRefresh?.();

        expect(updateReady.value).toBe(true);
    });

    it('«Actualizar» activa la versión que espera, que recarga la página al tomar el control', async () => {
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        registeredWith().onNeedRefresh?.();
        const { updateReady, update } = useServiceWorker();

        await update();

        expect(activate).toHaveBeenCalledExactlyOnceWith(true);
        expect(updateReady.value).toBe(false);
    });

    it('«Ahora no» lo cierra sin activar nada', async () => {
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        registeredWith().onNeedRefresh?.();
        const { updateReady, dismiss } = useServiceWorker();

        dismiss();

        expect(updateReady.value).toBe(false);
        expect(activate).not.toHaveBeenCalled();
    });

    it('sin registro (desarrollo), actualizar no hace nada', async () => {
        const { useServiceWorker } = await load();

        await expect(useServiceWorker().update()).resolves.toBeUndefined();
        expect(activate).not.toHaveBeenCalled();
    });
});
