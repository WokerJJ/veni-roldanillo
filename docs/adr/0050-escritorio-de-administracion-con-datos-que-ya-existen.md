# ADR 0050 · Escritorio de administración: tres widgets de solo lectura sobre datos que ya existen

- Estado: aceptada
- Fecha: 2026-11-20
- Precisa: ADR 0027 (panel de administración) y ADR 0031 (toques en «Enviar pedido por WhatsApp»)
- Afecta a: `app/Providers/Filament/AdminPanelProvider.php`, `app/Filament/Admin/Widgets/*`, `app/Support/MenuFreshness.php`, `app/Support/OrderIntentRanking.php`, `app/Support/CatalogOverview.php`, `app/Support/OrderIntentStats.php`, `resources/views/filament/admin/widgets/*` y `lang/{es,en}/panel.php`

## Contexto

El Escritorio de `/admin` estaba vacío. Para saber si los primeros restaurantes de verdad usan Vení hacen falta tres respuestas: quién mantiene su menú al día, si hay toques reales en «Enviar pedido por WhatsApp» y cómo va el catálogo. Una versión más ambiciosa (visitas, «uso de los clientes») se descartó: exigiría medir a las personas, y la política de datos (ADR 0030) y el ADR 0031 dicen que no hay seguimiento.

## Decisión

- **Solo datos que ya existen, sin migraciones, cookies ni política nueva.** Lo que sale es de `restaurants`, `dishes`, `menu_sections`, `daily_menus`, `order_intents` y las tablas de solicitudes.
- **Frescura de los menús** (`MenuFreshness`): por ficha publicada, el mayor `updated_at` entre sus platos, secciones y almuerzos del día, del más viejo al más reciente; sin menú sale primero. No se usó `restaurants.updated_by_owner_at` porque mezcla el perfil con el menú. Marcar un plato como agotado cuenta como actividad: se dice en la pantalla (es una señal, no una garantía de que el menú esté bien). Los días son fechas de Colombia.
- **Toques** (`OrderIntentStats::overall` y `OrderIntentRanking`): reutilizan la ventana de 7 o 30 días en hora de Colombia del ADR 0031, sumando todos los restaurantes, más un ranking de 10 con el período anterior al lado. La pantalla repite que son toques, no pedidos. Con menos de 20 toques en el período anterior (`MIN_PREVIOUS_FOR_PERCENT`) no se muestra porcentaje, solo los números: «+300 %» sobre 1 contra 4 engaña.
- **Estado del catálogo** (`CatalogOverview`): publicadas (sin reclamar y reclamadas), ocultas (incluye los borradores de OpenStreetMap), y las solicitudes pendientes de reclamo, retiro y captura de campo, cada una con enlace a su recurso solo si el recurso deja entrar a esa persona.
- **Sin librerías de gráficos:** tarjetas y tablas con barras, como en las estadísticas del dueño, legibles con lector de pantalla y con el estado en texto, no solo en color.
- **Autorización:** el panel solo deja entrar a administración y cada widget lo exige otra vez (`AdminWidget::canView`), porque un widget es un componente de Livewire con su propia ruta de actualización. Los widgets no son diferidos: son consultas agregadas pequeñas.
- **Consultas:** una por widget (sin N+1; la de frescura son tres máximos agrupados por `restaurant_id` con los índices de las tablas, y la de toques usa `(restaurant_id, created_at)`). La tabla de frescura muestra las 25 más atrasadas y dice cuántas hay.

## Consecuencias

- Los números sirven para el piloto con restaurantes reales sin tocar la privacidad de nadie; no dicen cuántas personas usan la app, y eso es a propósito.
- Las fichas ficticias salen marcadas «ejemplo» en lugar de excluirse, para que el Escritorio se vea con los datos de desarrollo.
- Con cientos de restaurantes, la consulta de frescura sigue siendo un recorrido de las tres tablas; si llegara a pesar, se cachea unos minutos en un ADR propio.
