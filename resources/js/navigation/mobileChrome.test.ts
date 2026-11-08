import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Lo que la navegación del celular (#139, ADR 0041) le pide al CSS de toda
 * la app, leído de los archivos: la barra de pestañas no tapa lo que recibe
 * el foco, con `viewport-fit=cover` nada queda bajo la isla ni las esquinas
 * del iPhone acostado, y Tailwind escanea todos los componentes.
 */
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');
const style = (path: string) => read(path).split('<style scoped>')[1] ?? '';

const appCss = read('../css/app.css');
const mapCss = read('../css/map.css');
/** Lo que la barra le pide a toda página va en su CSS, que baja aparte del arranque. */
const tabBarCss = style('components/TabBar.vue');

describe('la barra de pestañas no tapa lo que recibe el foco (EVA-064, WCAG 2.4.11)', () => {
    it('toda página deja libre abajo el alto de la barra al llevar algo a la vista', () => {
        // En el CSS de la barra, que baja aparte: app.css viaja en el arranque.
        expect(tabBarCss).toMatch(/:global\(html\) \{\s*scroll-padding-bottom: var\(--veni-tabbar-space\);\s*\}/);
    });

    it('con la barra del pedido de la ficha, se suman las dos', () => {
        expect(style('components/OrderBar.vue')).toMatch(/:global\(html\.has-order-bar\) \{\s*scroll-padding-bottom: calc\([^;]*var\(--veni-tabbar-space, 0px\)\);/);
    });
});

describe('Tailwind escanea todos los componentes (EVA-065)', () => {
    it('no deja afuera ningún archivo de componente: solo las palabras que no son clases en ninguna plantilla', () => {
        expect(appCss).not.toMatch(/@source not '[^']*\.vue'/);
        const inline = /@source not inline\('([^']+)'\);/.exec(appCss)?.[1]?.split(/\s+/) ?? [];

        expect(inline).toEqual(expect.arrayContaining(['transition', 'backdrop-filter']));
    });
});

describe('márgenes laterales seguros con viewport-fit=cover (EVA-071)', () => {
    const safeX = /padding-inline: max\(1rem, env\(safe-area-inset-left\)\) max\(1rem, env\(safe-area-inset-right\)\);/;

    it('la cabecera y el pie usan el margen que respeta la isla y las esquinas', () => {
        expect(tabBarCss).toMatch(new RegExp(`:global\\(\\.veni-safe-x\\) \\{\\s*${safeX.source}`));

        const layout = read('layouts/AppLayout.vue');
        expect(layout.match(/class="[^"]*\bveni-safe-x\b/g)).toHaveLength(2);
    });

    it('el contenido de las páginas suma el margen del sistema a los lados; el mapa no', () => {
        expect(tabBarCss).toMatch(/:global\(\.veni-safe-inset\) \{\s*padding-inline: env\(safe-area-inset-left\) env\(safe-area-inset-right\);/);
        expect(read('layouts/AppLayout.vue')).toMatch(/<main[^>]*:class="immersive \? 'relative min-h-0' : 'veni-safe-inset'"/);
    });

    it('la cabecera chica y la barra de pestañas respetan los dos lados', () => {
        expect(style('components/CompactHeader.vue')).toMatch(/\.compact-header \{[^}]*padding: env\(safe-area-inset-top\) max\(1rem, env\(safe-area-inset-right\)\) 0 max\(0\.5rem, env\(safe-area-inset-left\)\);/);
        expect(tabBarCss).toMatch(
            /\.tabbar \{[^}]*padding: 0 max\(0\.75rem, env\(safe-area-inset-right\)\) calc\(0\.5rem \+ env\(safe-area-inset-bottom\)\) max\(0\.75rem, env\(safe-area-inset-left\)\);/,
        );
    });

    it('los botones y la atribución del mapa no quedan bajo la isla del iPhone acostado (ADR 0003)', () => {
        expect(mapCss).toMatch(/\.maplibregl-ctrl-top-left,\s*\.maplibregl-ctrl-bottom-left \{\s*left: env\(safe-area-inset-left, 0px\);/);
        expect(mapCss).toMatch(/\.maplibregl-ctrl-top-right,\s*\.maplibregl-ctrl-bottom-right \{\s*right: env\(safe-area-inset-right, 0px\);/);
    });

    it('el panel al costado (side:) empieza después de la isla', () => {
        expect(read('pages/Home.vue')).toMatch(/floating: \{[^}]*sheet: '[^']*\bveni-safe-side\b/);
        expect(tabBarCss).toMatch(/@media \(width >= 48rem\), \(width >= 30rem\) and \(height < 32rem\) \{\s*:global\(\.veni-safe-side\) \{\s*left: max\(1rem, env\(safe-area-inset-left\)\);/);
    });
});
