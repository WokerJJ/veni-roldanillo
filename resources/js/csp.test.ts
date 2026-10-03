import { afterEach, describe, expect, it } from 'vitest';

import { cspNonce } from './csp';

function addNonceMeta(nonce: string): HTMLMetaElement {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'csp-nonce');
    meta.setAttribute('nonce', nonce);
    document.head.append(meta);

    return meta;
}

describe('cspNonce', () => {
    afterEach(() => {
        document.head.querySelectorAll('meta[property="csp-nonce"]').forEach((meta) => {
            meta.remove();
        });
    });

    it('lee el nonce que deja la vista raíz', () => {
        addNonceMeta('abc123');

        expect(cspNonce()).toBe('abc123');
    });

    it('lo encuentra aunque el navegador haya vaciado el atributo', () => {
        // Con la CSP activa el atributo queda vacío y solo la propiedad lo conserva.
        const meta = addNonceMeta('');
        meta.nonce = 'oculto';

        expect(cspNonce()).toBe('oculto');
    });

    it('sin la etiqueta o sin valor no hay nonce', () => {
        expect(cspNonce()).toBeUndefined();

        addNonceMeta('');

        expect(cspNonce()).toBeUndefined();
    });
});
