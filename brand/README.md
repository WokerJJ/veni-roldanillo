# Guía de marca · Vení Roldanillo

**Vení** es voseo valluno: una invitación ("vení, comamos") que funciona para los locales y para el turista ("vení a Roldanillo"). En la "í", la tilde es el ala de un parapente y el palito de la i es el piloto, un guiño al parapente de Roldanillo.

## Logo

Todos los archivos están en curvas (no dependen de fuentes instaladas).

| Archivo | Uso |
| --- | --- |
| `logo/veni-roldanillo.svg` | Logo principal con localizador, sobre fondos claros |
| `logo/veni-roldanillo-blanco.svg` | Logo principal sobre fondos oscuros (ciruela) |
| `logo/veni-wordmark.svg` / `-blanco.svg` | Solo "vení", cuando "Roldanillo" ya está en contexto |
| `logo/veni-icono.svg` | Ícono de la app (PWA, tiendas, redes) |
| `logo/veni-icono-maskable.svg` | Ícono maskable para Android (sin esquinas) |
| `logo/favicon.svg` | Favicon del sitio |
| `logo/veni-sello.svg` / `-arrebol.svg` | Stickers de mesa, bolsas de domicilio, impresos |

Exportaciones PNG en `png/` (192, 512 y 1024 px para el ícono; 32 y 180 px para el favicon).

**Reglas:** no deformar, no cambiar colores fuera de la paleta, no separar el ala de la í, dejar un margen libre alrededor igual a la altura de la "e".

## Colores

| Nombre | Hex | Uso |
| --- | --- | --- |
| Ciruela | `#2A1638` | Texto principal, fondos oscuros, marca |
| Arrebol | `#F0525A` | Acento principal. Solo formas o texto grande (≥24 px) sobre blanco |
| Mango | `#F7A93B` | Estrellas, destacados, ala sobre fondo oscuro |
| Lila | `#F3ECF6` | Superficies y fondos suaves |
| Blanco | `#FFFFFF` | Fondo base |
| Ciruela suave | `#6A5578` | Texto secundario |

Tokens listos para usar: `tokens.css` y `tokens.json`.

## Tipografía

- **Bricolage Grotesque** (700-800): logo y títulos.
- **Figtree** (400-700): textos e interfaz.

Ambas son de Google Fonts con licencia SIL Open Font License, libres para uso comercial. En producción se autohospedan (no depender del CDN de Google).

## Voz

- Cercana y valluna, con voseo: vení, pedí, acercá, probá.
- Clara, sin exageraciones ni promesas vacías.
- En inglés: simple y amable, para el turista.

**Eslogan:** "Vení, comamos en Roldanillo" · *"Come eat in Roldanillo"*
