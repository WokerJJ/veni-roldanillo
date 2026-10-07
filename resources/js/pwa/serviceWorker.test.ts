import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ServiceWorkerModule from './serviceWorker';

/*
| El módulo virtual de vite-plugin-pwa 2.0 (registerType 'prompt'), simulado
| como se porta de verdad (dist/client/build/register.js): cuando avisa de una
| versión nueva deja escuchando el cambio de controlador y, si la página ya
| tenía service worker al abrirse, llama a `onNeedReload` o, sin ella,
| recarga la página. Lo hace en cada pestaña que mostró el aviso, acepte quien
| acepte. La función que devuelve manda SKIP_WAITING a la versión que espera
| e ignora su argumento.
*/
const activate = vi.fn<(reloadPage?: boolean) => Promise<void>>(() => Promise.resolve());
let newVersion: () => void = () => undefined;
/** Si la página ya tenía service worker al registrarse (una actualización). */
let hadController = true;

const registerSW = vi.fn<(options?: RegisterSWOptions) => typeof activate>((options = {}) => {
    const isUpdate = hadController;

    newVersion = () => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!isUpdate) {
                return;
            }

            if (options.onNeedReload) {
                options.onNeedReload();
            } else {
                window.location.reload();
            }
        });
        options.onNeedRefresh?.();
    };

    return activate;
});

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

/**
 * navigator.serviceWorker de un navegador que lo soporta: dispara
 * `controllerchange` a pedido y devuelve un registro con una versión
 * esperando (`waiting: null` si otra pestaña ya la activó).
 */
let serviceWorkerContainer: EventTarget;
let registration: { waiting: object | null; unregister: () => Promise<boolean> };
const reload = vi.fn();

beforeEach(() => {
    registerSW.mockClear();
    activate.mockClear();
    reload.mockClear();
    hadController = true;
    registration = { waiting: {}, unregister: vi.fn(() => Promise.resolve(true)) };
    serviceWorkerContainer = Object.assign(new EventTarget(), {
        getRegistration: vi.fn(() => Promise.resolve(registration)),
        getRegistrations: vi.fn(() => Promise.resolve([registration])),
    });
    // happy-dom no trae serviceWorker; un navegador que lo soporta, sí.
    vi.stubGlobal('navigator', { serviceWorker: serviceWorkerContainer });
    vi.stubGlobal('location', { reload });
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

/*
| En desarrollo no se registra ninguno, pero el navegador puede traer el de
| un build de producción servido antes en este mismo origen (`npm run build`,
| la imagen de producción en local): seguiría sirviendo lo guardado encima de
| Vite.
*/
describe('en desarrollo', () => {
    it('quita los service workers que haya en este origen', async () => {
        const { unregisterServiceWorkers } = await load();

        await unregisterServiceWorkers();

        expect(registration.unregister).toHaveBeenCalledOnce();
        expect(registerSW).not.toHaveBeenCalled();
    });

    it('en un navegador sin service workers no hace nada', async () => {
        vi.stubGlobal('navigator', {});
        const { unregisterServiceWorkers } = await load();

        await expect(unregisterServiceWorkers()).resolves.toBeUndefined();
    });

    it('si el navegador no deja consultarlos, avisa en la consola y la app sigue', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.stubGlobal('navigator', {
            serviceWorker: { getRegistrations: () => Promise.reject(new DOMException('Acceso denegado', 'SecurityError')) },
        });
        const { unregisterServiceWorkers } = await load();

        await expect(unregisterServiceWorkers()).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledOnce();
    });
});

describe('aviso de versión nueva', () => {
    it('aparece cuando una versión nueva queda esperando', async () => {
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        const { updateReady } = useServiceWorker();

        expect(updateReady.value).toBe(false);

        newVersion();

        expect(updateReady.value).toBe(true);
    });

    it('«Actualizar» activa la versión que espera', async () => {
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        newVersion();
        const { updateReady, update } = useServiceWorker();

        await update();

        // Sin argumento: en vite-plugin-pwa 2.0 ya no decide si recarga.
        expect(activate).toHaveBeenCalledExactlyOnceWith();
        expect(updateReady.value).toBe(false);
    });

    it('«Ahora no» lo cierra sin activar nada', async () => {
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        newVersion();
        const { updateReady, dismiss } = useServiceWorker();

        dismiss();

        expect(updateReady.value).toBe(false);
        expect(activate).not.toHaveBeenCalled();
    });

    it('otra pestaña activa la versión: esta no recarga y el aviso sigue', async () => {
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        newVersion();

        // La versión nueva toma el control de todas las pestañas a la vez.
        serviceWorkerContainer.dispatchEvent(new Event('controllerchange'));

        expect(reload).not.toHaveBeenCalled();
        expect(useServiceWorker().updateReady.value).toBe(true);
    });

    it('la que acepta recarga una sola vez', async () => {
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        newVersion();

        await useServiceWorker().update();
        expect(reload).not.toHaveBeenCalled();

        serviceWorkerContainer.dispatchEvent(new Event('controllerchange'));
        serviceWorkerContainer.dispatchEvent(new Event('controllerchange'));

        expect(reload).toHaveBeenCalledOnce();
    });

    it('recarga también en la primera visita, cuando el registro no lo haría', async () => {
        hadController = false;
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        newVersion();

        await useServiceWorker().update();
        serviceWorkerContainer.dispatchEvent(new Event('controllerchange'));

        expect(reload).toHaveBeenCalledOnce();
    });

    it('si otra pestaña ya la activó, «Actualizar» recarga directo', async () => {
        const { registerServiceWorker, useServiceWorker } = await load();
        registerServiceWorker();
        newVersion();
        serviceWorkerContainer.dispatchEvent(new Event('controllerchange'));
        // Ya no hay versión esperando: la que esta pestaña vio ahora la controla.
        registration.waiting = null;

        await useServiceWorker().update();

        expect(activate).not.toHaveBeenCalled();
        expect(reload).toHaveBeenCalledOnce();
    });

    it('sin registro (desarrollo), actualizar no hace nada', async () => {
        const { useServiceWorker } = await load();

        await expect(useServiceWorker().update()).resolves.toBeUndefined();
        expect(activate).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });
});
