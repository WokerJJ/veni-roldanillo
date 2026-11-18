/*
| Entrada de /campo (ADR 0048): el shell estático (resources/views/campo.blade.php)
| monta aquí la herramienta. Es una entrada aparte de la app: no pasa por
| Inertia ni suma nada al arranque ni a la página de inicio. Su estilo es
| resources/campo/campo.css, que el shell enlaza.
*/

import { createApp } from 'vue';

import App from './App.vue';
import { createApi } from './api';
import { openStorage } from './storage';
import { createCampo } from './store';
import { loadTexts } from './texts';

async function start(): Promise<void> {
    loadTexts();

    const campo = createCampo({ api: createApi(), storage: await openStorage(), newUuid: () => crypto.randomUUID() });

    createApp(App, { campo }).mount('#campo');
}

void start();
