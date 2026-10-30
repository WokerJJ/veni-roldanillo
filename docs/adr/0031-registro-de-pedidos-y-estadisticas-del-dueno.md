# ADR 0031 · Registro del toque en «Enviar pedido por WhatsApp» y estadísticas del dueño: un conteo sin identificador

- Estado: aceptada
- Fecha: 2026-10-29
- Precisa: ADR 0004 (pedidos por WhatsApp), ADR 0024 (el carrito no mandaba nada al servidor y dejó `order_intents` para #22), ADR 0025 (panel del dueño) y ADR 0030 (política de datos versionada).
- Afecta a: `routes/api.php`, `app/Http/Controllers/Api/OrderIntentController.php`, `app/Providers/AppServiceProvider.php` (límite `order-intents`), `app/Models/OrderIntent.php`, `app/Enums/Fulfillment.php`, la migración `2026_10_29_100000_add_fulfillment_to_order_intents_table.php`, `routes/console.php`, `app/Support/OrderIntentStats.php`, `app/Filament/Owner/Pages/Statistics.php`, `resources/views/filament/owner/pages/statistics.blade.php`, `app/Policies/RestaurantPolicy.php`, `resources/js/order/intent.ts`, `resources/js/components/OrderCart.vue`, `lang/{es,en}/documents.php` (política 0.3) y `lang/{es,en}/panel.php`.

## Contexto

#22 pide que el dueño vea cuántas veces le escribieron desde Vení. El pedido no pasa por Vení (ADR 0004): lo único que el servidor puede saber es que alguien tocó «Enviar pedido por WhatsApp». La tabla `order_intents` existía desde la Fase 0 con `user_id`, `device_hash` (un identificador del dispositivo que nunca se implementó) y `confirmed` («¿Al final sí pediste?»).

Había que decidir qué se manda en ese toque, cómo se manda sin demorar WhatsApp, cómo se protege un endpoint público sin sesión, cómo no contar dos veces un doble toque, qué ve el dueño y cuánto se guarda. La regla de fondo es la de la política de datos: pedimos lo mínimo y no hay seguimiento.

## Alternativas

- **Identificar el dispositivo (`device_hash`).** Permitiría quitar repetidos con precisión, contar «personas» y preguntar después «¿Al final sí pediste?». Pero es un identificador persistente que enlaza todos los toques de un teléfono entre restaurantes y días: un perfil, aunque sea seudónimo, que la política dice que no armamos y que exigiría su propia autorización. El dueño no lo necesita para saber cuántos le escribieron. Se descarta.
- **Asociar el toque a la cuenta (`user_id`).** Lo mismo, con nombre. Además, la ruta de `/api` no tiene sesión. Se descarta.
- **Mandar el pedido o un resumen (platos, total, rango del total).** Los «platos más pedidos» serían útiles, pero son contenido del pedido, que la política y el ADR 0024 dejan fuera del servidor; un rango del total suma poco a un conteo y es un dato más del pedido. Se descartan.
- **Solo restaurante, hora y domicilio o recoger.** Es lo mínimo que responde «¿cuánto me escriben, cuándo y para qué?»: domicilio o recoger le dice al dueño si le conviene reforzar los domicilios. Ninguno de los tres datos identifica a nadie. Se elige esta.

Para mandarlo:

- **`navigator.sendBeacon`.** Hecho para esto, pero con `Content-Type: application/json` algunos navegadores lo rechazan o lo mandan sin él, y no deja controlar las cookies.
- **`fetch` con `keepalive: true`, sin esperar la respuesta.** Sobrevive a que la página se vaya, manda JSON y `credentials: 'omit'` deja fuera cualquier cookie. Se elige; el enlace a wa.me sigue siendo un `<a>` real que no se frena ni se demora.

Para protegerlo: un token CSRF exige sesión (y su cookie) en cada toque. Sin sesión, el endpoint exige JSON (un formulario de otro sitio no puede mandar ese `Content-Type` sin una consulta CORS, y la app no habilita CORS), rechaza `Sec-Fetch-Site: cross-site` y limita por IP. Lo peor que puede hacer un abuso es inflar un conteo, que no expone ningún dato.

## Decisión

- **Endpoint** `POST /api/restaurants/{slug}/order-intents`, cuerpo `{"fulfillment": "delivery" | "pickup"}`. Se lee solo ese campo; cualquier otro se ignora. Respuestas: 204 (registrado o repetido), 403 (de otro sitio), 415 (no es JSON), 422 (falta o no es uno de los dos), 404 (ficha inexistente, oculta o sin WhatsApp, la misma respuesta en los tres casos), 429 (más de `ORDER_INTENTS_PER_MINUTE` = 30 por minuto por IP real).
- **Qué se guarda:** `restaurant_id`, `fulfillment` (columna nueva con CHECK) y `created_at`. `user_id`, `device_hash` y `confirmed` quedan nulos en este flujo; las columnas se quedan (el trigger de anonimización sigue protegiendo `device_hash` si alguna vez se llenara). No se guardan platos, total, dirección, nombre, ubicación ni IP.
- **Un doble toque cuenta una vez:** el carrito no repite el aviso del mismo restaurante en 10 s, y el servidor guarda 10 s en la caché una llave con la huella HMAC (con `APP_KEY`) de la IP y el restaurante; si ya está, responde 204 sin registrar. La IP nunca llega a `order_intents`. El costo: dos personas detrás de la misma IP (NAT del operador) que piden al mismo restaurante en el mismo instante cuentan una vez. Es un conteo, no una contabilidad.
- **Estadísticas:** página `Statistics` del panel del dueño (`/panel/{slug}/statistics`), autorizada con `RestaurantPolicy::viewStatistics` (dueño o administración; no un empleado) además de la tenancy de Filament. Muestra los toques de los últimos 7 o 30 días, día por día en hora de Colombia, contra los 7 o 30 anteriores (con el cambio en porcentaje) y cuántos eran a domicilio o para recoger. Una sola consulta agregada por restaurante, que recorre el índice `(restaurant_id, created_at)`. Sin librerías de gráficos: tarjetas y una tabla con barras, que se leen igual con un lector de pantalla.
- **Retención:** 13 meses (`OrderIntent::RETENTION_MONTHS`), con `model:prune` diario en el scheduler: alcanza para comparar un mes con el mismo del año anterior.
- **Política de datos 0.3:** dice qué se registra al tocar «Enviar», para qué y por cuánto, y que el registro no dice quién fue.

## Consecuencias

- El dueño ve un número honesto: toques, no pedidos confirmados (la persona puede no mandar el mensaje). La página lo dice.
- **«¿Al final sí pediste?» queda fuera.** Preguntarlo después exige reconocer el toque anterior del mismo teléfono, es decir, un identificador o guardar el id del registro en el dispositivo; si algún día se hace, va en un ADR propio y con la política actualizada.
- Abrir el enlace desde el menú del navegador (mantener presionado, «Abrir en otra pestaña») no dispara el clic y no se cuenta. Sin conexión, el aviso se pierde y el pedido sale igual.
- El aviso va en el chunk diferido del carrito: el arranque no crece (`resources/js/map/bundle.test.ts`).
- Si se agregan datos al aviso, hay que subir la versión de la política y pasar por un ADR nuevo.
