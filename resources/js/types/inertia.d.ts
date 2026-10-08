import type { Locale, PageMeta } from '@/composables/useI18n';
import type { Translations } from '@/i18n/translate';

// Props que comparte app/Http/Middleware/HandleInertiaRequests.php en todas las
// páginas y, opcional, `meta`: la que manda una página con título y
// descripción propios (la ficha de un restaurante).
declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            locale: Locale;
            translations: Translations;
            meta?: PageMeta;
        };
        // Props que una página le pasa a AppLayout con defineOptions({ layout: { … } }).
        layoutProps: {
            immersive: boolean;
        };
    }
}
