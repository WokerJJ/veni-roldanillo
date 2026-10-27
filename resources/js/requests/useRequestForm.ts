import { router } from '@inertiajs/vue3';
import type { Ref } from 'vue';
import { reactive, ref } from 'vue';

import { useI18n } from '@/composables/useI18n';

/**
 * El envío de «Reclámalo» y «Pedir que retiren esta ficha» (#20, ADR 0026).
 *
 * Usa el router de Inertia, que ya viaja en el arranque, en vez de `useForm`:
 * la página no suma código al bundle de inicio. El servidor responde con una
 * redirección a la misma página con `sent: true`; si algo no valida, con los
 * avisos por campo, ya en el idioma de la petición. Lo que no es de Inertia
 * (429 por el límite, 419 si la sesión venció, un 500, sin señal) se avisa
 * aquí, sin el diálogo de Inertia.
 *
 * `preserveState`: la página es la misma; lo escrito no se pierde si algo
 * falla.
 */

/** El campo trampa: el servidor lo nombra igual (RestaurantContactRequest::HONEYPOT). */
export const HONEYPOT_FIELD = 'website';

/** Clave de un aviso general, que no es de un campo. */
export const FORM_ERROR = 'form';

export type RequestFields = Record<string, string | boolean>;

/** El contacto mínimo y la autorización de datos que piden los dos formularios. */
export interface ContactFields extends RequestFields {
    contact_name: string;
    contact_phone: string;
    contact_email: string;
    accepts_privacy: boolean;
    website: string;
}

/** Lo que nombra el aviso de privacidad (Ley 1581): lo manda el servidor. */
export interface PrivacyNotice {
    controller: string;
    contact_email: string;
    version: string;
}

/** Los campos de contacto vacíos, para empezar un formulario. */
export function emptyContact(): ContactFields {
    return { contact_name: '', contact_phone: '', contact_email: '', accepts_privacy: false, website: '' };
}

export interface RequestForm<T extends RequestFields> {
    fields: T;
    errors: Ref<Record<string, string>>;
    processing: Ref<boolean>;
    submit: () => void;
}

export function useRequestForm<T extends RequestFields>(url: string, initial: T): RequestForm<T> {
    const { t } = useI18n();
    const fields = reactive({ ...initial }) as T;
    const errors = ref<Record<string, string>>({});
    const processing = ref(false);

    function submit(): void {
        // El doble toque no manda dos veces (el servidor tampoco duplica).
        if (processing.value) {
            return;
        }

        router.post(url, { ...fields }, {
            preserveScroll: true,
            preserveState: true,
            onStart: () => {
                processing.value = true;
            },
            onFinish: () => {
                processing.value = false;
            },
            onSuccess: () => {
                errors.value = {};
            },
            onError: (received) => {
                errors.value = { ...received };
            },
            onHttpException: (response) => {
                const key = response.status === 429 ? 'requests.error.too_many' : response.status === 419 ? 'requests.error.expired' : 'requests.error.failed';
                errors.value = { [FORM_ERROR]: t(key) };

                return false;
            },
            onNetworkError: () => {
                errors.value = { [FORM_ERROR]: t('requests.error.failed') };

                return false;
            },
        });
    }

    return { fields, errors, processing, submit };
}
