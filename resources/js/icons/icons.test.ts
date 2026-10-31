import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
| El mapa de los íconos bajo demanda baja aparte (onDemand.ts), con el
| primero que se pide: sin señal no llega, y no puede quedar perdido para
| siempre.
*/

const network = vi.hoisted(() => ({ up: false }));

vi.mock('@/icons/onDemand', () => {
    if (!network.up) {
        throw new TypeError('Failed to fetch dynamically imported module');
    }

    return { onDemand: { './sancocho.svg': () => Promise.resolve('<svg viewBox="0 0 24 24"><path d="M1 1h22"/></svg>') } };
});

beforeEach(() => {
    vi.resetModules();
    network.up = false;
});

describe('loadIcon con el mapa de los íconos bajo demanda', () => {
    it('si el mapa no bajó, lo vuelve a pedir la próxima vez', async () => {
        const { loadIcon } = await import('./icons');

        await expect(loadIcon('sancocho')).rejects.toThrow();

        network.up = true;

        await expect(loadIcon('sancocho')).resolves.toEqual({ attributes: { viewBox: '0 0 24 24' }, body: '<path d="M1 1h22"/>' });
    });

    it('los íconos del layout se pintan sin pedir el mapa', async () => {
        const { loadIcon, readyIcon } = await import('./icons');

        expect(readyIcon('sol')).toBeDefined();
        await expect(loadIcon('luna')).resolves.toMatchObject({ body: expect.any(String) as string });
    });
});
