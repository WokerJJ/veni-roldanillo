import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as FakeInertia from '@/testing/inertia';

vi.mock('@inertiajs/vue3', () => import('@/testing/inertia'));

/*
 * «¿Es tu negocio? Reclámalo» y «Pedir que retiren esta ficha» (#20, ADR
 * 0026): los dos formularios comparten el contacto, la autorización de datos,
 * el campo trampa, los avisos y la confirmación (RequestFormPage).
 */

const RESTAURANT = { slug: 'la-ceiba', name: 'La Ceiba (ficticio)', fictitious: true };
const PRIVACY = { controller: 'Vení Roldanillo', contact_email: 'privacidad@example.test', version: '2026-10-26' };

type Kind = 'Claim' | 'Removal';

interface PostOptions {
    onStart?: () => void;
    onFinish?: () => void;
    onSuccess?: () => void;
    onError?: (errors: Record<string, string>) => void;
    onHttpException?: (response: { status: number }) => boolean | undefined;
    onNetworkError?: () => boolean | undefined;
    preserveState?: boolean;
}

async function mountForm(kind: Kind, { sent = false, locale = 'es' }: { sent?: boolean; locale?: 'es' | 'en' } = {}) {
    const inertia = (await import('@inertiajs/vue3')) as unknown as typeof FakeInertia;
    inertia.reset();
    inertia.receiveFromServer(locale, { replace: true });

    const { default: Page } = kind === 'Claim' ? await import('./Claim.vue') : await import('./Removal.vue');
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mount(Page, { props: { restaurant: RESTAURANT, sent, privacy: PRIVACY }, attachTo: host });
    await flushPromises();

    /** Lo último que se mandó con router.post: la URL, los datos y las opciones. */
    const lastPost = () => {
        const call = inertia.router.post.mock.calls.at(-1) as [string, Record<string, unknown>, PostOptions] | undefined;
        if (!call) {
            throw new Error('No se llamó a router.post');
        }

        return { url: call[0], data: call[1], options: call[2] };
    };

    return { inertia, wrapper, lastPost };
}

async function fillContact(wrapper: Awaited<ReturnType<typeof mountForm>>['wrapper']): Promise<void> {
    await wrapper.get('[data-field="contact_name"] input').setValue('Persona de Prueba');
    await wrapper.get('[data-field="contact_phone"] input').setValue('300 000 1234');
    await wrapper.get('[data-field="accepts_privacy"]').setValue(true);
}

enableAutoUnmount(afterEach);

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    document.body.replaceChildren();
});

describe.each(['Claim', 'Removal'] as const)('Restaurants/%s', (kind) => {
    const path = kind === 'Claim' ? '/restaurants/la-ceiba/claim' : '/restaurants/la-ceiba/removal';

    it('cada campo tiene su etiqueta, y el celular su ayuda enlazada', async () => {
        const { wrapper } = await mountForm(kind);

        for (const input of wrapper.findAll('input:not([type="radio"]):not([type="checkbox"]):not([data-honeypot]), textarea')) {
            const id = input.attributes('id');
            expect(id).toBeTruthy();
            expect(wrapper.find(`label[for="${String(id)}"]`).exists()).toBe(true);
        }

        const phone = wrapper.get('[data-field="contact_phone"] input');
        const hintId = phone.attributes('aria-describedby');
        expect(wrapper.get(`[id="${String(hintId)}"]`).text()).toContain('300 123 4567');
        expect(phone.attributes('type')).toBe('tel');
    });

    it('el campo trampa queda fuera de la vista, del teclado y del lector de pantalla', async () => {
        const { wrapper } = await mountForm(kind);
        const trap = wrapper.get('[data-honeypot]');

        expect(trap.attributes('tabindex')).toBe('-1');
        expect(trap.attributes('autocomplete')).toBe('off');
        expect(trap.element.closest('[aria-hidden="true"]')).not.toBeNull();
    });

    it('cuenta cómo se tratan los datos y pide aceptarlo', async () => {
        const { wrapper } = await mountForm(kind);

        expect(wrapper.get('[data-privacy]').text()).toContain('no se publican ni se comparten');
        expect(wrapper.get('[data-privacy]').text()).toContain('Ley 1581');
        expect((wrapper.get('[data-field="accepts_privacy"]').element as HTMLInputElement).checked).toBe(false);
    });

    it('manda lo escrito a su dirección, con el campo trampa vacío', async () => {
        const { wrapper, lastPost } = await mountForm(kind);
        await fillContact(wrapper);

        await wrapper.get('form').trigger('submit');

        const { url, data, options } = lastPost();
        expect(url).toBe(path);
        expect(data).toMatchObject({ contact_name: 'Persona de Prueba', contact_phone: '300 000 1234', accepts_privacy: true, website: '' });
        expect(options.preserveState).toBe(true);
    });

    it('mientras se envía, el botón lo dice y otro toque no manda dos veces', async () => {
        const { wrapper, inertia, lastPost } = await mountForm(kind);
        await wrapper.get('form').trigger('submit');
        lastPost().options.onStart?.();
        await flushPromises();

        const button = wrapper.get('[data-submit]');
        expect(button.text()).toBe('Enviando…');
        expect(button.attributes('disabled')).toBeDefined();

        await wrapper.get('form').trigger('submit');
        expect(inertia.router.post).toHaveBeenCalledTimes(1);

        lastPost().options.onFinish?.();
        await flushPromises();
        expect(wrapper.get('[data-submit]').text()).toBe('Enviar solicitud');
    });

    it('los avisos del servidor salen en el resumen, que recibe el foco, y en su campo', async () => {
        const { wrapper, lastPost } = await mountForm(kind);
        await wrapper.get('form').trigger('submit');

        lastPost().options.onError?.({ contact_phone: 'Escribí un celular colombiano de diez dígitos, por ejemplo 300 123 4567.' });
        await flushPromises();

        const summary = wrapper.get('[data-errors]');
        expect(summary.attributes('role')).toBe('alert');
        expect(summary.text()).toContain('Revisá estos campos:');
        expect(document.activeElement).toBe(summary.element);

        const phone = wrapper.get('[data-field="contact_phone"] input');
        expect(phone.attributes('aria-invalid')).toBe('true');
        const describedBy = String(phone.attributes('aria-describedby')).split(' ');
        expect(describedBy.map((id) => wrapper.get(`[id="${id}"]`).text())).toContain('Escribí un celular colombiano de diez dígitos, por ejemplo 300 123 4567.');
    });

    it('el aviso de privacidad dice quién responde por los datos y a qué correo escribir', async () => {
        const { wrapper } = await mountForm(kind);
        const privacy = wrapper.get('[data-privacy]').text();

        expect(privacy).toContain('Vení Roldanillo');
        expect(privacy).toContain('privacidad@example.test');
        expect(wrapper.get('[data-privacy] a[href="mailto:privacidad@example.test"]').text()).toBe('privacidad@example.test');
    });

    it('el error de la autorización queda enlazado a la casilla', async () => {
        const { wrapper, lastPost } = await mountForm(kind);
        await wrapper.get('form').trigger('submit');

        lastPost().options.onError?.({ accepts_privacy: 'Para enviarla, aceptá el tratamiento de tus datos.' });
        await flushPromises();

        const consent = wrapper.get('[data-field="accepts_privacy"]');
        expect(consent.attributes('id')).toBeTruthy();
        expect(consent.attributes('aria-invalid')).toBe('true');
        const describedBy = String(consent.attributes('aria-describedby')).split(' ');
        expect(describedBy.map((id) => wrapper.get(`[id="${id}"]`).text())).toContain('Para enviarla, aceptá el tratamiento de tus datos.');
    });

    it('con error en el grupo de opciones, cada opción lo anuncia', async () => {
        const group = kind === 'Claim' ? 'claimant_role' : 'relationship';
        const message = kind === 'Claim' ? 'Elegí tu rol en el local.' : 'Elegí tu relación con el negocio.';
        const { wrapper, lastPost } = await mountForm(kind);
        await wrapper.get('form').trigger('submit');

        lastPost().options.onError?.({ [group]: message });
        await flushPromises();

        const radios = wrapper.findAll(`fieldset[data-field="${group}"] input[type="radio"]`);
        expect(radios.length).toBeGreaterThan(1);
        for (const radio of radios) {
            expect(radio.attributes('aria-invalid')).toBe('true');
            const describedBy = String(radio.attributes('aria-describedby')).split(' ');
            expect(describedBy.map((id) => wrapper.get(`[id="${id}"]`).text())).toContain(message);
        }
    });

    it('cada aviso del resumen enlaza a su campo', async () => {
        const group = kind === 'Claim' ? 'claimant_role' : 'relationship';
        const text = kind === 'Claim' ? 'message' : 'reason';
        const { wrapper, lastPost } = await mountForm(kind);
        await wrapper.get('form').trigger('submit');

        lastPost().options.onError?.({ contact_name: 'A', contact_phone: 'B', contact_email: 'C', [group]: 'D', [text]: 'E', accepts_privacy: 'F' });
        await flushPromises();

        const links = wrapper.findAll('[data-errors] li a');
        expect(links.map((link) => link.text())).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
        const targets = links.map((link) => wrapper.get(`[id="${String(link.attributes('href')).slice(1)}"]`));
        expect(targets.map((target) => target.element.tagName)).toEqual(['INPUT', 'INPUT', 'INPUT', 'INPUT', 'TEXTAREA', 'INPUT']);
        expect(targets[3]?.attributes('type')).toBe('radio');
        expect(targets[5]?.attributes('data-field')).toBe('accepts_privacy');
        expect(wrapper.get(`[data-field="${text}"] textarea`).attributes('id')).toBe(String(links[4]?.attributes('href')).slice(1));
    });

    it.each([
        [429, 'Enviaste muchas solicitudes seguidas. Probá de nuevo más tarde.'],
        [419, 'La página se venció. Recargala y volvé a enviar.'],
        [500, 'No pudimos enviar la solicitud. Revisá la conexión y probá otra vez.'],
    ])('una respuesta %i se avisa aquí, sin el diálogo de Inertia', async (status, text) => {
        const { wrapper, lastPost } = await mountForm(kind);
        await wrapper.get('form').trigger('submit');

        expect(lastPost().options.onHttpException?.({ status })).toBe(false);
        await flushPromises();

        expect(wrapper.get('[data-errors]').text()).toBe(text);
    });

    it('sin señal también lo avisa', async () => {
        const { wrapper, lastPost } = await mountForm(kind);
        await wrapper.get('form').trigger('submit');

        expect(lastPost().options.onNetworkError?.()).toBe(false);
        await flushPromises();

        expect(wrapper.get('[data-errors]').text()).toContain('No pudimos enviar la solicitud');
    });

    it('enviada, muestra la confirmación con el plazo y sin el formulario', async () => {
        const { wrapper } = await mountForm(kind, { sent: true });

        expect(wrapper.find('form').exists()).toBe(false);
        const sent = wrapper.get('[data-sent]');
        expect(sent.attributes('role')).toBe('status');
        expect(sent.text()).toContain('Recibimos tu solicitud');
        expect(sent.text()).toContain('revisa a mano');
        expect(sent.text()).toContain('10 días hábiles');
    });

    it('al llegar la confirmación, el foco va a su título', async () => {
        const { wrapper } = await mountForm(kind);

        await wrapper.setProps({ restaurant: RESTAURANT, sent: true });
        await flushPromises();

        expect(document.activeElement).toBe(wrapper.get('[data-sent] h1').element);
    });

    it('vuelve a la ficha y avisa que es un restaurante de ejemplo', async () => {
        const { wrapper } = await mountForm(kind);

        expect(wrapper.get('[data-back]').attributes('href')).toBe('/restaurants/la-ceiba');
        expect(wrapper.text()).toContain('La Ceiba (ficticio)');
    });

    it('en inglés', async () => {
        const { wrapper } = await mountForm(kind, { locale: 'en' });

        expect(wrapper.get('[data-submit]').text()).toBe('Send request');
        expect(wrapper.get('h1').text()).toBe(kind === 'Claim' ? 'Claim La Ceiba (ficticio)' : 'Ask to remove La Ceiba (ficticio)');
    });
});

describe('Restaurants/Claim', () => {
    it('pide el rol con opciones de un grupo con su leyenda y lo manda', async () => {
        const { wrapper, lastPost } = await mountForm('Claim');
        const group = wrapper.get('fieldset[data-field="claimant_role"]');

        expect(group.get('legend').text()).toBe('Tu rol en el local');
        const radios = group.findAll('input[type="radio"]');
        expect(radios.map((radio) => radio.attributes('value'))).toEqual(['owner', 'manager']);

        await fillContact(wrapper);
        await radios[1]?.setValue(true);
        await wrapper.get('[data-field="message"] textarea').setValue('Hola (ficticio)');
        await wrapper.get('form').trigger('submit');

        expect(lastPost().data).toMatchObject({ claimant_role: 'manager', message: 'Hola (ficticio)' });
    });
});

describe('Restaurants/Removal', () => {
    it('pide la relación con el negocio y el motivo, y los manda', async () => {
        const { wrapper, lastPost } = await mountForm('Removal');
        const radios = wrapper.findAll('fieldset[data-field="relationship"] input[type="radio"]');

        expect(radios.map((radio) => radio.attributes('value'))).toEqual(['owner', 'manager', 'employee', 'other']);

        await fillContact(wrapper);
        await radios[3]?.setValue(true);
        await wrapper.get('[data-field="reason"] textarea').setValue('El local cerró (ficticio).');
        await wrapper.get('form').trigger('submit');

        expect(lastPost().data).toMatchObject({ relationship: 'other', reason: 'El local cerró (ficticio).' });
    });
});
