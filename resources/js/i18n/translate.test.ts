import { describe, expect, it } from 'vitest';

import { translate } from './translate';

const translations = {
    'home.title': 'Inicio',
    'layout.footer': '© :year Vení Roldanillo',
    'greeting': 'Hola, :name. Bienvenido, :Name. ¡:NAME!',
    'full': ':name_full (:name)',
    'pair': ':first y :second',
};

describe('translate', () => {
    it('devuelve el texto de la clave', () => {
        expect(translate(translations, 'home.title')).toBe('Inicio');
    });

    it('reemplaza marcadores con textos y números', () => {
        expect(translate(translations, 'layout.footer', { year: 2026 })).toBe('© 2026 Vení Roldanillo');
    });

    it('respeta las variantes :Nombre y :NOMBRE como __() de Laravel', () => {
        expect(translate(translations, 'greeting', { name: 'ana' })).toBe('Hola, ana. Bienvenido, Ana. ¡ANA!');
    });

    it('prueba primero los marcadores más largos', () => {
        expect(translate(translations, 'full', { name: 'Ana', name_full: 'Ana Ruiz' })).toBe('Ana Ruiz (Ana)');
    });

    it('reemplaza en una sola pasada: un valor con «:marcador» queda tal cual', () => {
        expect(translate(translations, 'pair', { first: ':second', second: 'dos' })).toBe(':second y dos');
    });

    it('sin valores deja los marcadores intactos', () => {
        expect(translate(translations, 'layout.footer')).toBe('© :year Vení Roldanillo');
    });

    it('una clave que falta devuelve la clave', () => {
        expect(translate(translations, 'home.missing')).toBe('home.missing');
        expect(translate({}, 'home.title', { year: 2026 })).toBe('home.title');
    });

    it('no confunde propiedades heredadas del objeto con claves', () => {
        expect(translate(translations, 'constructor')).toBe('constructor');
        expect(translate(translations, 'toString')).toBe('toString');
    });
});
