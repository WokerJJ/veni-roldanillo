import type { TranslationKey } from '@/composables/useI18n';

/**
 * Los documentos legales (#23, ADR 0030) y sus direcciones, en un solo lugar:
 * los usan LegalLinks (pie, bienvenida y créditos). Las rutas son las de
 * routes/web.php (legal.privacy, legal.terms y legal.reviews); Pest prueba que
 * el servidor las responde y Vitest, que los enlaces llevan estas.
 */
export const LEGAL_DOCUMENTS: readonly { key: 'privacy' | 'terms' | 'reviews'; href: string; label: TranslationKey }[] = [
    { key: 'privacy', href: '/privacy', label: 'legal.privacy_link' },
    { key: 'terms', href: '/terms', label: 'legal.terms_link' },
    { key: 'reviews', href: '/reviews-policy', label: 'legal.reviews_link' },
];
