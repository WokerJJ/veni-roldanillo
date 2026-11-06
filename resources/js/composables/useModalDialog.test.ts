import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, useTemplateRef } from 'vue';

import { useModalDialog } from './useModalDialog';

function mountProbe(onDismiss: () => void) {
    return mount(
        defineComponent({
            setup() {
                useModalDialog(useTemplateRef<HTMLDialogElement>('dialog'), { onDismiss });

                return () => h('dialog', { ref: 'dialog' }, 'Contenido de prueba');
            },
        }),
        { attachTo: document.body },
    );
}

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('useModalDialog', () => {
    it('al montarse lo abre como modal', () => {
        const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
        const dialog = mountProbe(vi.fn()).get('dialog').element;

        expect(showModal).toHaveBeenCalledOnce();
        expect(dialog.open).toBe(true);
    });

    it('sin showModal (un navegador viejo), lo abre con el atributo open', () => {
        const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: undefined, configurable: true });

        try {
            expect(mountProbe(vi.fn()).get('dialog').attributes('open')).toBe('');
        } finally {
            if (original !== undefined) {
                Object.defineProperty(HTMLDialogElement.prototype, 'showModal', original);
            }
        }
    });

    it('Escape (cancel) no lo cierra solo: lo cancela y avisa', () => {
        const onDismiss = vi.fn();
        const dialog = mountProbe(onDismiss).get('dialog').element;
        const cancel = new Event('cancel', { cancelable: true });

        dialog.dispatchEvent(cancel);

        expect(cancel.defaultPrevented).toBe(true);
        expect(onDismiss).toHaveBeenCalledOnce();
        expect(dialog.open).toBe(true);
    });

    it('si el navegador lo cierra (close nativo), avisa', () => {
        const onDismiss = vi.fn();
        const dialog = mountProbe(onDismiss).get('dialog').element;

        dialog.close();

        expect(onDismiss).toHaveBeenCalledOnce();
    });

    it('al desmontarse lo cierra sin avisar: ya lo sacó quien lo abrió', () => {
        const onDismiss = vi.fn();
        const wrapper = mountProbe(onDismiss);
        const dialog = wrapper.get('dialog').element;
        const close = vi.spyOn(dialog, 'close');

        wrapper.unmount();

        expect(close).toHaveBeenCalledOnce();
        expect(dialog.open).toBe(false);
        dialog.dispatchEvent(new Event('close'));
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        expect(onDismiss).not.toHaveBeenCalled();
    });
});
