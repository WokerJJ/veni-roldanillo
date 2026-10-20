import { flushPromises } from '@vue/test-utils';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { GeolocateControl } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubGeolocation } from '@/testing/geolocation';
import * as fake from '@/testing/maplibre';

import type { LocateTexts } from './locate';
import { addLocateControl } from './locate';
import type { MapPadding } from './padding';
import { NO_PADDING } from './padding';

const TEXTS: LocateTexts = {
    button: '¿Dónde estoy?',
    found: 'Listo: tu ubicación está en el mapa.',
    close: 'Cerrar el aviso',
    problems: { denied: 'Sin permiso.', signal: 'Sin señal.', outside: 'Fuera del mapa.', unsupported: 'Sin geolocalización.' },
};

const OPTIONS = {
    positionOptions: { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    trackUserLocation: true,
    fitBoundsOptions: { maxZoom: 16 },
};

const PLAZA = { longitude: -76.1547, latitude: 4.4128 };

let host: HTMLElement;

beforeEach(() => {
    fake.reset();
    host = document.createElement('div');
    document.body.append(host);
});

afterEach(() => {
    host.remove();
});

/** Lo que hace el motor: un mapa con los botones de zoom y, debajo, «¿Dónde estoy?». */
function setUp(padding: () => MapPadding = () => ({ ...NO_PADDING })) {
    const device = stubGeolocation();
    const map = new fake.Map({ container: host, center: [PLAZA.longitude, PLAZA.latitude], zoom: 13 });
    map.addControl(new fake.NavigationControl(), 'top-right');
    const locate = addLocateControl(map as unknown as MapLibreMap, () => new fake.GeolocateControl(OPTIONS) as unknown as GeolocateControl, TEXTS, padding);

    return {
        device,
        map,
        locate,
        button: () => host.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-geolocate'),
        notice: () => host.querySelector('[role="alert"]'),
    };
}

describe('addLocateControl', () => {
    it('mientras MapLibre lo prepara el botón sigue deshabilitado (todavía no atiende el toque), pero ya con su nombre', async () => {
        const { button } = setUp();

        expect(button()?.disabled).toBe(true);
        expect(button()?.title).toBe('¿Dónde estoy?');

        await flushPromises();

        expect(button()?.disabled).toBe(false);
        expect(button()?.getAttribute('aria-pressed')).toBe('false');
    });

    it('si MapLibre le cambia el nombre o lo deshabilita, lo deshace; liberado, ya no', async () => {
        const { button, locate } = setUp();
        await flushPromises();
        const current = button() as HTMLButtonElement;

        current.title = 'Find my location';
        current.disabled = true;
        await flushPromises();

        expect(current.title).toBe('¿Dónde estoy?');
        expect(current.disabled).toBe(false);

        locate.dispose();
        current.title = 'Find my location';
        await flushPromises();

        expect(current.title).toBe('Find my location');
        expect(host.querySelector('[aria-live]')).toBeNull();
    });

    it('el aviso va justo después del botón en el orden del teclado, antes de los controles de otra esquina', async () => {
        const { device, map, button, notice } = setUp();
        await flushPromises();
        // Como la atribución, abajo a la derecha.
        map.addControl(new fake.NavigationControl(), 'bottom-right');

        button()?.click();
        device.fail(3);

        const focusable = [...host.querySelectorAll('button')];

        expect(notice()?.textContent).toContain('Sin señal.');
        expect(focusable.indexOf(notice()?.querySelector('button') as HTMLButtonElement)).toBe(focusable.indexOf(button() as HTMLButtonElement) + 1);
    });

    it('lo que solo oye el lector de pantalla se oculta con una clase del mapa, no de la página', () => {
        setUp();

        expect(host.querySelector('[aria-live="polite"]')?.className).toBe('veni-sr-only');
    });

    it('el margen se pide en cada encuadre, con el panel como esté en ese momento', async () => {
        const padding = vi.fn<() => MapPadding>(() => ({ ...NO_PADDING, bottom: 300 }));
        const { device, map, button } = setUp(padding);
        await flushPromises();

        button()?.click();
        device.move(PLAZA);
        padding.mockReturnValue({ ...NO_PADDING, left: 200 });
        device.move({ ...PLAZA, latitude: 4.413 });

        expect(map.fitBounds.mock.calls.map((call) => call[1])).toMatchObject([
            { maxZoom: 16, padding: { ...NO_PADDING, bottom: 300 } },
            { maxZoom: 16, padding: { ...NO_PADDING, left: 200 } },
        ]);
    });

    it('con el permiso negado cambia el control por uno nuevo: el aviso sigue y el foco pasa a su botón', async () => {
        const { device, map, button, notice } = setUp();
        await flushPromises();
        const first = button() as HTMLButtonElement;
        const control = map.controls[1];

        first.focus();
        first.click();
        device.fail(1);
        await flushPromises();

        expect(map.controls).toHaveLength(2);
        expect(map.controls[1]).not.toBe(control);
        expect(first.isConnected).toBe(false);
        expect(notice()?.textContent).toContain('Sin permiso.');
        expect(document.activeElement).toBe(button());
        expect(button()?.disabled).toBe(false);
    });
});

/*
| Lo que el ADR 0019 da por hecho del GeolocateControl de MapLibre 6, con el
| de verdad sobre un mapa mínimo (happy-dom no tiene WebGL). Si una versión
| nueva lo cambia, falla aquí antes que en el navegador.
*/
describe('el GeolocateControl de MapLibre', () => {
    /**
     * Los controles que siguen en un mapa: MapLibre cuenta los que siguen la
     * ubicación en todo su módulo, y quitar uno pone la cuenta en cero. Así
     * cada prueba empieza de cero, en cualquier orden.
     */
    const added: { map: { removeControl(control: GeolocateControl): void }; control: GeolocateControl }[] = [];

    afterEach(() => {
        for (const { map, control } of added.splice(0)) {
            map.removeControl(control);
        }
    });

    /** Lo que el control usa del mapa, sin marca ni círculo (necesitarían el mapa de verdad). */
    function realSetUp() {
        const device = stubGeolocation();
        const container = host;
        const map = {
            controls: [] as GeolocateControl[],
            fitBounds: vi.fn(),
            getContainer: () => container,
            getMaxBounds: () => null,
            getBearing: () => 0,
            on: vi.fn(),
            off: vi.fn(),
            _getUIString: (key: string) => key,
            addControl(control: GeolocateControl) {
                added.push({ map: this, control });
                this.controls.push(control);
                container.append(control.onAdd(this as unknown as MapLibreMap));
            },
            removeControl(control: GeolocateControl) {
                if (this.controls.includes(control)) {
                    this.controls.splice(this.controls.indexOf(control), 1);
                    control.onRemove();
                }
            },
        };
        const create = () => new GeolocateControl({ ...OPTIONS, showUserLocation: false, showAccuracyCircle: false });
        const button = () => container.querySelector<HTMLButtonElement>('button.maplibregl-ctrl-geolocate');

        return { device, map, create, button };
    }

    it('termina de preparar el botón un momento después: ahí le pone aria-pressed y atiende el toque', async () => {
        const { map, create, button } = realSetUp();
        map.addControl(create());

        expect(button()?.disabled).toBe(true);
        expect(button()?.hasAttribute('aria-pressed')).toBe(false);

        await flushPromises();

        expect(button()?.disabled).toBe(false);
        expect(button()?.getAttribute('aria-pressed')).toBe('false');
    });

    it('sigue la ubicación con las opciones dadas y lee fitBoundsOptions en cada encuadre', async () => {
        const { device, map, create, button } = realSetUp();
        const control = create();
        map.addControl(control);
        await flushPromises();

        button()?.click();

        expect(device.lastOptions()).toEqual(OPTIONS.positionOptions);
        expect(button()?.classList.contains('maplibregl-ctrl-geolocate-waiting')).toBe(true);

        device.move(PLAZA);
        control.options.fitBoundsOptions = { maxZoom: 16, padding: 40 };
        device.move(PLAZA);

        expect(map.fitBounds.mock.calls.map((call) => (call as unknown[])[1])).toMatchObject([{ maxZoom: 16 }, { maxZoom: 16, padding: 40 }]);
    });

    it('sin permiso deshabilita el botón antes de avisar «error» con el código, y deja de pedir la ubicación', async () => {
        const { device, map, create, button } = realSetUp();
        const control = create();
        map.addControl(control);
        await flushPromises();
        const seen: { code: number; disabled: boolean | undefined }[] = [];
        control.on('error', (event: { code: number }) => {
            seen.push({ code: event.code, disabled: button()?.disabled });
        });

        button()?.click();
        device.fail(1);

        expect(seen).toEqual([{ code: 1, disabled: true }]);
        expect(device.watching()).toBe(0);
        expect(button()?.getAttribute('aria-pressed')).toBe('false');
    });

    it('tras negarse el permiso, el mismo control pide una posición vieja y sin plazo; uno nuevo, otra vez las opciones dadas', async () => {
        const { device, map, create, button } = realSetUp();
        const control = create();
        map.addControl(control);
        await flushPromises();

        button()?.click();
        device.fail(1);
        // Habilitado otra vez, como lo deja la app.
        (button() as HTMLButtonElement).disabled = false;
        button()?.click();

        expect(device.lastOptions()).toEqual({ maximumAge: 600_000, timeout: 0 });

        map.removeControl(control);
        map.addControl(create());
        await flushPromises();
        button()?.click();

        expect(device.lastOptions()).toEqual(OPTIONS.positionOptions);
    });
});
