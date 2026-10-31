import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
| El registro de páginas de app.ts (import.meta.glob con `base`, para que sus
| claves viajen cortas en el arranque: resources/js/map/bundle.test.ts). Estas
| pruebas fijan el formato de las claves: el nombre que manda el servidor
| (Inertia::render) con «/» para las anidadas, sin «./pages».
*/

const inertia = vi.hoisted(() => ({ options: null as null | { resolve: (name: string) => Promise<unknown> } }));

vi.mock('@inertiajs/vue3', () => ({
    createInertiaApp: (options: { resolve: (name: string) => Promise<unknown> }) => {
        inertia.options = options;

        return Promise.resolve();
    },
    router: {},
}));
vi.mock('@/visitErrors', () => ({ openVisitErrorsAsPages: vi.fn() }));
vi.mock('@/pwa/serviceWorker', () => ({ registerServiceWorker: vi.fn(), unregisterServiceWorkers: vi.fn(() => Promise.resolve()) }));
vi.mock('@/layouts/AppLayout.vue', () => ({ default: {} }));
vi.mock('@/pages/Restaurants/Show.vue', () => ({ default: { name: 'RestaurantShow' } }));
vi.mock('@/pages/Home.vue', () => ({ default: { name: 'Home' } }));

async function resolve(name: string): Promise<unknown> {
    await import('./app');

    if (inertia.options === null) {
        throw new Error('app.ts no llamó a createInertiaApp.');
    }

    return inertia.options.resolve(name);
}

beforeEach(() => {
    vi.resetModules();
    inertia.options = null;
});

describe('registro de páginas', () => {
    it('resuelve una página de primer nivel por su nombre', async () => {
        await expect(resolve('Home')).resolves.toMatchObject({ default: { name: 'Home' } });
    });

    it('resuelve una página anidada con «/», como la manda el servidor (Restaurants/Show)', async () => {
        await expect(resolve('Restaurants/Show')).resolves.toMatchObject({ default: { name: 'RestaurantShow' } });
    });

    it('una página que no existe es un error con su nombre', async () => {
        await expect(resolve('No/Existe')).rejects.toThrow('No existe la página No/Existe.');
    });
});
