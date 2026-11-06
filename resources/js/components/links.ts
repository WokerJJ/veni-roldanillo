/*
| Lo que el layout y el inicio piden aparte del arranque, en un solo chunk
| (ADR 0037): la navegación de la cabecera, el enlace a la guía de platos típicos
| y los documentos legales. Son tres componentes, pero viajan juntos: cada chunk
| más en la lista de dependencias se paga en el arranque. El nombre del
| archivo viaja en el arranque (nombra el chunk): corto.
*/
export { default as DishGuideLink } from '@/components/DishGuideLink.vue';
export { default as LegalLinks } from '@/components/LegalLinks.vue';
export { default as MainNav } from '@/components/MainNav.vue';
