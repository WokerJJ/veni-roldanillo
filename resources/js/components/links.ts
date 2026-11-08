/*
| Lo que el layout y el inicio piden aparte del arranque, en un solo chunk
| (ADR 0037): la navegación de la cabecera, el enlace a la guía de platos típicos
| y los documentos legales, y lo del celular (#139, ADR 0041): la barra de
| pestañas, la cabecera chica al desplazar y los ajustes del inicio. Son
| varios componentes, pero viajan juntos: cada chunk más en la lista de
| dependencias se paga en el arranque. El nombre del
| archivo viaja en el arranque (nombra el chunk): corto.
*/
export { default as CompactHeader } from '@/components/CompactHeader.vue';
export { default as DishGuideLink } from '@/components/DishGuideLink.vue';
export { default as LegalLinks } from '@/components/LegalLinks.vue';
export { default as MainNav } from '@/components/MainNav.vue';
export { default as SettingsMenu } from '@/components/SettingsMenu.vue';
export { default as TabBar } from '@/components/TabBar.vue';
