import { describe, expect, it, vi } from 'vitest';

/*
| Los íconos propios (resources/icons/veni, ADR 0036) bajan en el mismo mapa
| bajo demanda que los de colombia-icons. En su propio archivo: el mapa, una
| vez que bajó, queda cargado, y icons.test.ts prueba qué pasa cuando no baja.
*/

vi.mock('@/icons/onDemand', () => ({
    onDemand: { './sancocho.svg': () => Promise.resolve('<svg viewBox="0 0 24 24"><path d="M1 1h22"/></svg>') },
    // Un propio con el nombre de uno de colombia-icons no es ese.
    veniIcons: {
        './veni/generico.svg': () => Promise.resolve('<svg viewBox="0 0 24 24" stroke-width="1.5"><path d="M2 2h20"/></svg>'),
        './veni/sancocho.svg': () => Promise.resolve('<svg viewBox="0 0 24 24"><path d="M3 3h18"/></svg>'),
        './veni/sol.svg': () => Promise.resolve('<svg viewBox="0 0 24 24"><path d="M4 4h16"/></svg>'),
    },
}));

describe('loadIcon con los íconos propios (ADR 0036)', () => {
    it('pinta un propio desde su carpeta, con el mismo mapa bajo demanda', async () => {
        const { loadIcon } = await import('./icons');

        await expect(loadIcon('veni/generico')).resolves.toEqual({ attributes: { viewBox: '0 0 24 24', 'stroke-width': '1.5' }, body: '<path d="M2 2h20"/>' });
        await expect(loadIcon('veni/sancocho')).resolves.toEqual({ attributes: { viewBox: '0 0 24 24' }, body: '<path d="M3 3h18"/>' });
        await expect(loadIcon('sancocho')).resolves.toEqual({ attributes: { viewBox: '0 0 24 24' }, body: '<path d="M1 1h22"/>' });
    });

    it('un propio con el nombre de un crítico no es el crítico, y uno que no existe falla', async () => {
        const { loadIcon, readyIcon } = await import('./icons');

        expect(readyIcon('veni/sol')).toBeUndefined();
        await expect(loadIcon('veni/sol')).resolves.toEqual({ attributes: { viewBox: '0 0 24 24' }, body: '<path d="M4 4h16"/>' });
        await expect(loadIcon('veni/no-existe')).rejects.toThrow('No existe el ícono «veni/no-existe».');
    });
});
