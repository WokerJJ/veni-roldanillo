import type { Locale } from '@/composables/useI18n';
import type { Translations } from '@/i18n/translate';

// Props que comparte app/Http/Middleware/HandleInertiaRequests.php en todas las páginas.
declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            locale: Locale;
            translations: Translations;
        };
    }
}
