import { afterEach, describe, expect, it } from 'vitest';

import { currentLocale, list, loadTexts, setLocale, t } from './texts';

function shell(texts: unknown): Document {
    const doc = document.implementation.createHTMLDocument('Campo');
    const block = doc.createElement('script');
    block.type = 'application/json';
    block.id = 'campo-texts';
    block.textContent = JSON.stringify(texts);
    doc.body.append(block);

    return doc;
}

const TEXTS = {
    es: { home: { sent_ok: 'Enviadas: :n', new: 'Nueva ficha' }, days: ['Domingo', 'Lunes'] },
    en: { home: { sent_ok: 'Sent: :n', new: 'New listing' }, days: ['Sunday', 'Monday'] },
};

afterEach(() => {
    localStorage.clear();
});

describe('textos de /campo', () => {
    it('lee el bloque JSON del shell y reemplaza los marcadores', () => {
        loadTexts(shell(TEXTS));
        setLocale('es');

        expect(t('home.new')).toBe('Nueva ficha');
        expect(t('home.sent_ok', { n: 3 })).toBe('Enviadas: 3');
        expect(list('days')).toEqual(['Domingo', 'Lunes']);
    });

    it('cambia de idioma y recuerda la elección', () => {
        loadTexts(shell(TEXTS));
        setLocale('en');

        expect(t('home.new')).toBe('New listing');

        loadTexts(shell(TEXTS));

        expect(currentLocale()).toBe('en');
    });

    it('una clave que falta sale como ella misma, para notarla', () => {
        loadTexts(shell(TEXTS));

        expect(t('no.existe')).toBe('no.existe');
        expect(list('no.existe')).toEqual([]);
    });

    it('un bloque roto no tumba la pantalla', () => {
        const doc = shell(TEXTS);
        const block = doc.getElementById('campo-texts');

        if (block) {
            block.textContent = '{roto';
        }

        loadTexts(doc);

        expect(t('home.new')).toBe('home.new');
    });
});
