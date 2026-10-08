import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IconArt } from '@/icons/icons';

import { iconImage, iconSvg } from './iconImage';

/** Un ícono como los de colombia-icons: trazo en `currentColor`, sin tamaño propio. */
const ART: IconArt = {
    attributes: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
    body: '<path d="M4 12h16"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
};

/** Imagen de mentira: happy-dom no decodifica imágenes. */
function stubImage(decode: () => Promise<void> = () => Promise.resolve()) {
    const created: { width: number; height: number; src: string }[] = [];

    vi.stubGlobal(
        'Image',
        class {
            src = '';
            decode = decode;

            constructor(
                public width: number,
                public height: number,
            ) {
                created.push(this);
            }
        },
    );

    return created;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('iconSvg', () => {
    it('arma un SVG completo, del tamaño pedido y con el dibujo del ícono', () => {
        expect(iconSvg(ART, 36, '#FFFFFF')).toBe(
            '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2">' +
                '<path d="M4 12h16"/><circle cx="12" cy="12" r="3" fill="#FFFFFF"/></svg>',
        );
    });

    it('no deja ningún currentColor: dentro del mapa no hay texto del que heredarlo', () => {
        expect(iconSvg(ART, 18, '#F0525A')).not.toContain('currentColor');
    });
});

describe('iconImage', () => {
    it.each([
        [1, 18, 1],
        [2, 36, 2],
        // Entre dos densidades se dibuja a la de arriba: se ve nítido.
        [1.5, 36, 2],
        // Más de 3 no se nota y pesa en memoria.
        [4, 54, 3],
        // Con la página alejada el navegador informa menos de 1.
        [0.5, 18, 1],
    ])('con %f píxeles por punto dibuja 18 px en %i y lo informa (%i)', async (devicePixelRatio, pixels, pixelRatio) => {
        vi.stubGlobal('devicePixelRatio', devicePixelRatio);
        const created = stubImage();

        const image = await iconImage(ART, { size: 18, color: '#FFFFFF' });

        expect(image.pixelRatio).toBe(pixelRatio);
        expect(image.data).toBe(created[0]);
        expect(created).toEqual([expect.objectContaining({ width: pixels, height: pixels })]);
    });

    it('la imagen sale de una URL data: con el SVG, sin pedir nada a la red', async () => {
        vi.stubGlobal('devicePixelRatio', 2);
        const created = stubImage();

        await iconImage(ART, { size: 18, color: '#FFFFFF' });

        expect(created[0]?.src).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(ART, 36, '#FFFFFF'))}`);
    });

    it('si el navegador no puede decodificarla, falla: quien la pide decide qué hacer', async () => {
        stubImage(() => Promise.reject(new DOMException('The source image cannot be decoded.', 'EncodingError')));

        await expect(iconImage(ART, { size: 18, color: '#FFFFFF' })).rejects.toThrow('cannot be decoded');
    });
});
