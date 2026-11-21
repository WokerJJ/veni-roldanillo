# ADR 0051 · El arranque del mapa, medido: el motor se adelanta desde el HTML y el panel de un enlace compartido nace con su alto

- Estado: aceptada
- Fecha: 2026-11-21
- Precisa: ADR 0007 (el motor del mapa baja con `import()` al montar el mapa: ahora, en el inicio, también se anuncia desde el HTML), ADR 0022 (el panel de abajo y sus tres alturas) y ADR 0047 (el presupuesto del arranque, que no cambia).
- Afecta a: `app/Support/MapPreload.php` (nuevo), `resources/views/app.blade.php`, `resources/js/pages/Home.vue`, `tests/Pest.php` y las pruebas de `RootViewTest` y `Home.test.ts`.

## Contexto

Con los datos de campo (Cloudflare Web Analytics) y PageSpeed móvil del dominio de pruebas, el inicio mostraba un TBT de 1.730 ms, un LCP de 4,7 s y un CLS de 0,161 en el panel del mapa. El servidor no era el problema (responde en ~10 ms). Se midió el arranque con la compilación de producción de `main` servida en un contenedor aparte, con Lighthouse móvil (5 pasadas) y un arnés con perfil de CPU de V8 (4x de CPU, 1,6 Mbps y 150 ms de latencia), sin tocar el despliegue de pruebas.

Lo que salió:

- **El elemento del LCP es el enlace «© colaboradores de OpenStreetMap»**, que MapLibre crea al hacer `new Map()`: el LCP es el momento en que el mapa termina de montar sus controles (≈ 5,3 s en el arnés, igual que «mapa listo»).
- **El motor (≈ 320 kB comprimidos) solo empezaba a bajar a 1,5 s**, cuando la entrada ya se había ejecutado y montado Home, y tardaba 2,5 s en bajar a 1,6 Mbps. El HTML no lo anunciaba porque lo carga un `import()` (ADR 0007).
- **El hilo principal** (3,2 s activos con 4x de CPU): dibujar fotogramas de MapLibre 33 % (de eso, ≈ 400 ms compilar shaders), montar Vue/Inertia 24 %, evaluar los chunks del motor 14 %, el estilo 11 %, y un 5 % de crear el `Intl.DateTimeFormat` de `openStatus.ts`. Las tareas largas máximas (270 a 470 ms) son fotogramas de MapLibre, no la descarga del script.
- **El CLS del panel** se reproduce al abrir un enlace `/?r=slug` (el que se comparte por WhatsApp): el panel nace asomado (8,5 rem) con la bienvenida y, al llegar la lista, se agranda hasta el resumen, sin que nadie toque nada. En un celular de 412 × 823 con un solo restaurante: 0,0325 en el panel; en campo, con otras pantallas y más datos, llega a 0,161.

## Alternativas

- **Diferir el arranque del mapa hasta la primera interacción.** Mejoraría el TBT de laboratorio, pero el mapa es el inicio (ADR 0007): quien abre la app quiere verlo. Descartada; mover el trabajo no lo quita, y Lighthouse espera a que la red quede quieta antes de medir.
- **Partir el trabajo del mapa con `scheduler.yield`.** Las tareas largas son fotogramas dentro de MapLibre, que el código de la app no puede cortar.
- **Adelantar también la lista de restaurantes** (`<link rel="preload" as="fetch">`). Se probó: el navegador no la reutilizaba, la pedía dos veces (una a los 0,24 s y otra a los 1,5 s, esta con su ida y vuelta completa). Descartada.
- **Crear el formateador de `openStatus` de forma perezosa.** Se probó: el mismo trabajo de ICU pasa del arranque del módulo al primer cálculo, un poco más tarde; el total de CPU no cambió de forma medible. No se aplicó.
- **Menos capas, `fadeDuration`, `antialias`** u otras opciones de MapLibre: el dibujo es lo más pesado, pero el estilo (71 capas) es de `veni-mapa` y no se midió el efecto. Queda pendiente, con su propia medición.
- **Reservar el alto del panel solo mientras llega el resumen** y soltarlo al mostrarlo. Se probó primero y empeoró el CLS (0,13): el resumen es más bajo que la media altura y el panel se encogía al aparecer. Descartada.

## Decisión

- **El inicio anuncia el motor desde el HTML.** `App\Support\MapPreload::engineModules()` lee el manifest de la compilación y devuelve las URL del motor (`resources/js/map/engine.ts`) y de los módulos que comparte; `app.blade.php` pone un `<link rel="modulepreload">` por cada una, con el nonce de la CSP, solo cuando la página es `Home` y **después de `@vite`**: la entrada y la página se piden primero y el motor detrás. Puesto antes, retrasaba el primer pintado en el arnés. Sin compilación (servidor de Vite o sin `npm run build`) no emite nada. Las demás pantallas no lo reciben (ADR 0007), y el arranque de `bundle.test.ts` no cambia: es el del manifest, no el del HTML.
- **El panel de abajo de un enlace compartido nace a media altura y la conserva** (`min-height` con `--sheet-height`, solo con la variante `sheet:` de Tailwind: el celular vertical; no aplica en escritorio ni en el panel lateral). Se suelta cuando el panel deja de ser el resumen de ese enlace: el restaurante no está en la lista, se cierra el resumen, se pide la ruta, se cambia la altura con la manija, se elige otro restaurante o el panel falla. Si falla la lista, `reserveSheet` la apaga (el aviso se ajusta a su texto) y vuelve al pulsar «Reintentar»: el cambio automático de altura que provoca el reintento no la suelta. `Home.vue` lo lleva con `waitingForShared` y la suelta, en un solo lugar, `releaseSharedReserve`.
- **No se tocan** el tope de 76 kB, `import()` del motor ni ningún otro ADR.

## Medición (mismo periodo y la misma compilación, con y sin el aviso del motor, alternados)

La máquina de pruebas se volvió más lenta entre mis dos rondas (el TBT de la base pasó de 2,1 a 4–7 s), así que solo se comparan pasadas del mismo periodo. Lighthouse móvil, 3 pasadas cada una:

| | sin el aviso | con el aviso |
|---|---|---|
| LCP | 8,51 · 7,87 · 7,82 s (media 8,07) | 7,18 · 6,76 · 7,17 s (media 7,04) |
| FCP | 2,27 · 1,90 · 1,93 s | 1,97 · 2,10 · 1,92 s |
| TBT | 6.969 · 4.200 · 5.870 ms | 6.803 · 5.031 · 4.872 ms |

El LCP baja ≈ 1 s (−13 %); el FCP y el TBT no cambian de forma medible. En el arnés (4x de CPU, 1,6 Mbps), «mapa listo» llegó ≈ 0,7 s antes. CLS de `/?r=slug` (arnés, 412 × 823): del panel, 0,0325 → 0,0037 (queda el 0,0037 del enlace de créditos).

## Consecuencias

- **Un enlace a un restaurante que ya no se ve (ocultado o mal escrito) empeora**: el panel nace alto y, al llegar la lista sin ese restaurante, vuelve a asomarse (CLS ≈ 0,19 en ese caso, antes 0). Se acepta: los enlaces válidos son la inmensa mayoría y ese caso se arregla solo al quitar el enlace de donde se compartió.
- Si con el resumen del enlace abierto se elige otro restaurante, la reserva se suelta: el panel pasa a la altura de ese otro resumen y puede cambiar de forma una vez, como en cualquier cambio hecho por quien usa la app.
- Un resumen abierto desde un enlace deja un espacio vacío debajo si es más bajo que la media altura. Es la forma de que el panel no se mueva; la manija lo baja.
- El motor se descarga aunque quien abre el inicio no llegue a usar el mapa. Es lo mismo que ya pasaba (el mapa se monta siempre al abrir el inicio), solo que antes.
- Con la lista guardada (ADR 0046) y sin señal, el aviso del motor no cambia nada: el service worker ya lo tiene.
- Pendiente medido, no hecho: el dibujo de MapLibre (≈ 1/3 del hilo principal) y el estilo de 71 capas. Y el LCP seguirá siendo «cuando el mapa termina de montar» mientras el único elemento grande sea el crédito del mapa.
- Las pruebas de rendimiento aquí son de laboratorio (CPU y red simuladas, GL por software): sirven para comparar antes y después; la cifra real la da el campo.
