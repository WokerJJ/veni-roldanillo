<?php

// Los documentos legales públicos (#23, ADR 0030). Van aparte de lang/es.json
// porque lang/es.json viaja entero al navegador en la primera visita (ADR
// 0010): estos textos viajan solo a su página, como prop. Cada sección es una
// lista de bloques: un texto es un párrafo y una lista de textos, una lista con
// viñetas. La clave de la sección es su ancla (/privacy#rights) y es la misma
// en los dos idiomas. Cambiar lo que dice un documento exige subir su versión
// en App\Enums\LegalDocument.
//
// :controller y :email los pone el controlador (el responsable y el correo de
// config/privacy.php).
return [

    'privacy' => [
        'title' => 'Tratamiento de datos personales',
        'description' => 'Qué datos personales trata Vení Roldanillo, para qué, dónde quedan, por cuánto tiempo y cómo consultarlos, corregirlos o pedir que se borren (Ley 1581 de 2012).',
        'intro' => 'Esta política explica qué datos personales tratamos en Vení, para qué, dónde quedan y cómo podés ejercer tus derechos según la Ley 1581 de 2012 y el Decreto 1377 de 2013 (hoy en el Decreto 1074 de 2015). La regla de fondo es simple: pedimos lo mínimo, y lo que se puede quedar en tu teléfono se queda en tu teléfono.',
        'sections' => [
            'controller' => [
                'heading' => 'Quién responde por tus datos',
                'content' => [
                    'El responsable del tratamiento es :controller, el proyecto que hace este sitio en Roldanillo, Valle del Cauca, Colombia.',
                    'Para cualquier consulta, corrección, queja o pedido de borrado sobre tus datos, escribinos a :email. Ese es el canal de atención de esta política.',
                ],
            ],
            'scope' => [
                'heading' => 'A qué se aplica',
                'content' => [
                    'A los datos personales que trata Vení en este sitio y en la app instalable: los de quienes visitan el sitio, piden por WhatsApp, reclaman o piden retirar la ficha de un negocio, y los de las cuentas de dueños y de administración.',
                    'No se aplica a lo que hagan WhatsApp, Google Maps, Waze ni los restaurantes con tus datos cuando vos se los mandás o abrís sus servicios: cada uno responde por su propio tratamiento.',
                ],
            ],
            'data' => [
                'heading' => 'Qué datos tratamos y dónde quedan',
                'content' => [
                    'Explorar el directorio, el mapa, los menús y buscar no exige cuenta ni datos tuyos. Estos son los casos en que sí tratamos algo:',
                    [
                        'Reclamar una ficha («¿Es tu negocio? Reclámalo») o pedir que la retiren: tu nombre, tu celular, tu correo si lo dejás, tu rol o relación con el negocio, el mensaje o el motivo que escribas, y la fecha y la versión del aviso de privacidad que aceptaste. Se guardan en nuestra base de datos, no se publican y no se mandan a terceros.',
                        'Cuentas de dueños y de administración: nombre, correo, contraseña (guardada cifrada con un hash, nunca en claro), idioma y rol. Las crea el equipo de Vení o salen de un reclamo aprobado; el sitio no tiene registro abierto.',
                        'Datos de los negocios: nombre, dirección, horarios, menú, precios y el número de WhatsApp del restaurante, para que lo puedas contactar. Los publica o autoriza el negocio. Los locales que vienen de OpenStreetMap entran solo con nombre, tipo y punto en el mapa, nunca con teléfonos ni correos, y quedan ocultos hasta verificarlos.',
                        'Registros técnicos: al visitar el sitio, el servidor abre una sesión que guarda tu dirección IP, el navegador que usás y la última actividad, para que el sitio funcione y para protegerlo de abusos (límites de intentos). Se borra sola a las pocas horas de inactividad. Los límites de intentos guardan por un rato la IP y, en los formularios, una huella cifrada del celular, no el número.',
                    ],
                    'Búsqueda: lo que escribís en el buscador se usa para responder y no se guarda. Si la búsqueda falla, el registro anota solo el tipo de error, no lo que buscaste.',
                    'Por ahora no hay reseñas ni cuentas para calificar. Cuando lleguen (ver la política de reseñas), esta política se actualizará antes de pedirte cualquier dato nuevo.',
                ],
            ],
            'device' => [
                'heading' => 'Lo que se queda en tu teléfono',
                'content' => [
                    'Algunas cosas se guardan solo en tu dispositivo (en el almacenamiento del navegador) y nunca llegan a nuestro servidor:',
                    [
                        'Tu ubicación: se usa para mostrar dónde estás en el mapa y calcular rutas, en el teléfono. No se manda al servidor ni queda en la dirección de la página ni guardada.',
                        'El carrito de un pedido, por un día.',
                        'Tus datos de entrega (barrio, dirección, referencia y nombre), solo si marcás «Recordar» en el formulario del pedido, por 90 días desde la última vez que los usás. «Borrar datos guardados» los quita.',
                        'El idioma y el tema (claro u oscuro) que elegiste, y las páginas y archivos que la app guarda para funcionar sin conexión.',
                    ],
                    'Podés borrar todo esto cuando querás desde los ajustes de tu navegador (borrar los datos del sitio) o desinstalando la app.',
                ],
            ],
            'whatsapp' => [
                'heading' => 'El pedido por WhatsApp',
                'content' => [
                    'Al tocar «Enviar pedido por WhatsApp», tu teléfono arma el mensaje con el pedido y lo abre en WhatsApp, dirigido al restaurante. El mensaje lleva lo que vos pusiste: platos, total estimado, barrio, dirección, referencia, nombre, forma de pago y, solo si tocás «Agregar mi ubicación al mensaje», un enlace con tu ubicación.',
                    'Ese mensaje no pasa por Vení: viaja en el enlace de WhatsApp, pasa por los servidores de WhatsApp (Meta) y lo recibe el restaurante. Vos lo ves y decidís si lo enviás. Desde ese momento lo tratan WhatsApp y el restaurante, cada uno según sus propias políticas.',
                ],
            ],
            'cookies' => [
                'heading' => 'Cookies y medición',
                'content' => [
                    'Usamos solo las cookies que el sitio necesita para funcionar: la de la sesión, la de seguridad contra envíos falsos de formularios (CSRF) y la que recuerda tu idioma, por un año.',
                    'No usamos cookies de seguimiento, publicidad ni herramientas de analítica de terceros, y el sitio no carga scripts de otras empresas. Las tipografías y los íconos se sirven desde nuestro propio servidor.',
                ],
            ],
            'purposes' => [
                'heading' => 'Para qué los usamos',
                'content' => [
                    [
                        'Revisar un reclamo o un pedido de retiro y contactarte por él, al celular o al correo que dejaste.',
                        'Dar acceso a los paneles a dueños y administración.',
                        'Mostrar el directorio con la información de los negocios.',
                        'Mantener el sitio funcionando y seguro: sesiones, límites de intentos y registros de errores.',
                        'Atender las consultas y reclamos sobre esta política.',
                    ],
                    'No vendemos ni alquilamos datos, no los usamos para publicidad y no armamos perfiles de las personas.',
                ],
            ],
            'authorization' => [
                'heading' => 'Tu autorización',
                'content' => [
                    'Cuando un formulario pide datos tuyos, te muestra un resumen de este tratamiento y una casilla para autorizarlo. Sin marcarla, no se envía. Guardamos la fecha de la autorización y la versión del aviso que aceptaste, para poder demostrarla.',
                    'Los datos que tratamos para que el sitio funcione y sea seguro (la sesión y los registros técnicos) no necesitan una autorización aparte, porque sin ellos no podemos prestarte el servicio que pedís al abrir la página.',
                ],
            ],
            'processors' => [
                'heading' => 'Quién más interviene',
                'content' => [
                    [
                        'Proveedor de alojamiento: cuando el sitio se despliegue, el servidor y la base de datos estarán en un proveedor de alojamiento que actúa como encargado del tratamiento, solo con las instrucciones de Vení. Lo nombraremos aquí al contratarlo.',
                        'El mapa se descarga del sitio donde se publica (hoy, GitHub Pages). Como cualquier sitio web, ese servidor recibe la dirección IP y el navegador de quien lo pide; no recibe tu ubicación.',
                        'WhatsApp (Meta), Google Maps y Waze: no son encargados de Vení. Son servicios que vos elegís abrir desde un enlace, y desde ese momento rigen sus políticas.',
                        'OpenStreetMap es una fuente de datos del mapa y de algunos locales: no recibe datos tuyos.',
                    ],
                ],
            ],
            'transfers' => [
                'heading' => 'Transferencias fuera de Colombia',
                'content' => [
                    'No enviamos tus datos a otros responsables, en Colombia ni afuera. Si el proveedor de alojamiento tiene sus servidores fuera de Colombia, eso es una transmisión a un encargado: la haremos solo con un proveedor que dé garantías de protección adecuadas y lo indicaremos en esta política.',
                    'El mensaje de WhatsApp lo mandás vos y viaja por la infraestructura de Meta, que puede estar fuera de Colombia.',
                ],
            ],
            'retention' => [
                'heading' => 'Por cuánto tiempo',
                'content' => [
                    [
                        'Reclamos y pedidos de retiro: mientras se revisan y hasta seis meses después de resolverlos. Pasado ese tiempo, los rechazados se borran y los aprobados se anonimizan: se borran el nombre, el celular, el correo, el mensaje y el motivo, y queda solo el resultado (qué ficha, qué se decidió y cuándo), que explica por qué una ficha cambió de dueño o se ocultó.',
                        'Cuentas de dueños y de administración: mientras estén activas. Si pedís que se borre la tuya, la borramos salvo lo que una ley nos obligue a conservar.',
                        'Sesiones: se borran solas tras unas dos horas de inactividad.',
                        'Lo guardado en tu teléfono: lo que se dice arriba, o hasta que lo borrés.',
                    ],
                ],
            ],
            'rights' => [
                'heading' => 'Tus derechos',
                'content' => [
                    'Como titular de los datos, la Ley 1581 de 2012 te da derecho a:',
                    [
                        'Conocer, actualizar y rectificar tus datos.',
                        'Pedir prueba de la autorización que diste.',
                        'Saber qué uso les hemos dado.',
                        'Revocar la autorización y pedir que se borren, cuando no haya un deber legal o contractual de conservarlos.',
                        'Consultarlos gratis.',
                        'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), después de hacer la consulta o el reclamo ante nosotros.',
                    ],
                ],
            ],
            'how' => [
                'heading' => 'Cómo ejercerlos',
                'content' => [
                    'Escribinos a :email con tu nombre, cómo contactarte, qué pedís y, si podés, la ficha o el formulario del que se trata. Para cuidar tus datos, podemos pedirte que confirmés que sos vos (por ejemplo, desde el celular que dejaste). También lo puede pedir tu representante o apoderado, con el documento que lo acredite.',
                    [
                        'Consultas (qué datos tenemos y qué hacemos con ellos): te respondemos en un máximo de 10 días hábiles. Si no alcanzamos, te avisamos el motivo antes de que venza el plazo y te respondemos en máximo 5 días hábiles más.',
                        'Reclamos (corregir, actualizar, borrar o revocar, o avisar que no cumplimos esta política): te respondemos en un máximo de 15 días hábiles desde el día siguiente a recibirlo. Si no alcanzamos, te avisamos el motivo y te respondemos en máximo 8 días hábiles más. Si al reclamo le falta información, te la pedimos en los 5 días siguientes; si pasan dos meses sin que la mandés, entendemos que desististe.',
                    ],
                    'Mientras se resuelve un reclamo, marcamos el dato como «reclamo en trámite».',
                ],
            ],
            'security' => [
                'heading' => 'Cómo los cuidamos',
                'content' => [
                    'El sitio va por HTTPS, la base de datos no está expuesta a internet, las contraseñas se guardan con un hash, los formularios tienen límites de intentos y protección contra envíos falsos, y solo el equipo de administración ve las solicitudes. Ningún sistema es infalible: si ocurriera un incidente que afecte tus datos, lo informaremos a la SIC y a las personas afectadas como exige la ley.',
                ],
            ],
            'minors' => [
                'heading' => 'Niñas, niños y adolescentes',
                'content' => [
                    'Los formularios de reclamo y retiro son para quienes representan un negocio, y las cuentas de dueños y de administración son para personas adultas. No pedimos datos de menores de edad a sabiendas; si nos enteramos de que recibimos alguno, lo borramos.',
                ],
            ],
            'changes' => [
                'heading' => 'Vigencia y cambios',
                'content' => [
                    'Esta política rige desde la fecha que aparece arriba, junto a su versión. Si la cambiamos de forma importante, lo diremos en el sitio antes de aplicar el cambio; si un cambio afecta para qué usamos datos que ya tenemos, te pediremos una autorización nueva.',
                    'Las solicitudes enviadas antes de esta versión aceptaron el aviso provisional del 26 de octubre de 2026 (versión «2026-10-26»), que decía lo mismo que esta política sobre esos datos: se usan solo para revisar la solicitud, no se publican ni se comparten, y se borran o anonimizan a los seis meses de resolverla.',
                    'Las bases de datos se conservan mientras Vení preste el servicio, con los plazos de cada dato que se dicen arriba.',
                ],
            ],
        ],
    ],

    'terms' => [
        'title' => 'Términos de uso',
        'description' => 'Las reglas para usar Vení Roldanillo: un directorio de restaurantes sin comisiones, con pedidos por WhatsApp directo al restaurante e información orientativa.',
        'intro' => 'Estos términos son las reglas para usar Vení. Usar el sitio o la app significa que los aceptás. Están escritos para que se entiendan: si algo no queda claro, escribinos.',
        'sections' => [
            'what' => [
                'heading' => 'Qué es Vení',
                'content' => [
                    'Vení Roldanillo es un directorio de los restaurantes de Roldanillo, Valle del Cauca: menús con precios, horarios, mapa, «Almuerzos de hoy» y pedidos por WhatsApp. Lo hace :controller.',
                    'Usarlo es gratis y no necesita cuenta. Las cuentas existen solo para los dueños de los negocios y para el equipo de administración.',
                ],
            ],
            'orders' => [
                'heading' => 'Los pedidos son entre vos y el restaurante',
                'content' => [
                    'Vení no vende comida, no cobra, no recibe pagos y no cobra comisiones, ni a vos ni a los restaurantes. Cuando pedís por WhatsApp, el sitio solo arma el mensaje y lo abre en WhatsApp; el pedido, el precio final, el domicilio, el pago y la entrega se acuerdan directamente entre vos y el restaurante.',
                    'Vení no es parte de ese acuerdo. Cualquier reclamo por un pedido (lo que llegó, cómo llegó, cuánto costó) se hace al restaurante, que responde como vendedor según el Estatuto del Consumidor (Ley 1480 de 2011).',
                ],
            ],
            'information' => [
                'heading' => 'La información es orientativa',
                'content' => [
                    'Hacemos lo posible para que la información esté al día, pero puede cambiar sin aviso o tener errores:',
                    [
                        'Precios y «Total estimado»: el valor final lo confirma el restaurante.',
                        'Horarios, «Abierto ahora», menús, platos agotados y almuerzos del día: dependen de lo que publique cada negocio.',
                        'Rutas, distancias y tiempos: son estimados, calculados en tu teléfono con datos de OpenStreetMap. Mirá siempre por dónde vas y respetá las señales de tránsito.',
                        'Las fichas que no ha reclamado su dueño dicen «Información sin verificar» y la fecha de su última actualización.',
                    ],
                    'Si ves algo equivocado, avisanos o avisale al negocio.',
                ],
            ],
            'acceptable-use' => [
                'heading' => 'Uso aceptable',
                'content' => [
                    'Al usar Vení te comprometés a no:',
                    [
                        'Mandar reclamos, pedidos de retiro u otra información falsa, o hacerte pasar por otra persona o por un negocio.',
                        'Usar el sitio para molestar, engañar o perjudicar a personas o negocios.',
                        'Intentar entrar a cuentas o partes del sistema que no son tuyas, saltarte los límites de intentos o afectar el funcionamiento del sitio.',
                        'Copiar en masa el contenido de los negocios (automatizar descargas) para otros fines. Los datos que vienen de OpenStreetMap se pueden pedir bajo su licencia (ver Créditos).',
                    ],
                    'Si no se cumplen estas reglas, podemos bloquear el acceso, rechazar solicitudes o cerrar una cuenta.',
                ],
            ],
            'listings' => [
                'heading' => 'Fichas, reclamos y retiros',
                'content' => [
                    'Cualquier negocio puede reclamar su ficha o pedir que la retiren desde la ficha misma. Una persona del equipo revisa cada solicitud a mano y contacta a quien la envió. Guardar una solicitud no cambia nada en la ficha hasta que se aprueba.',
                    'Los dueños responden por lo que publican en su ficha (menú, precios, fotos, horarios, promociones) y garantizan que tienen derecho a publicarlo. Podemos corregir u ocultar lo que sea falso, engañoso o infrinja derechos de otros. Lo pagado o promocionado se marca como «Patrocinado».',
                ],
            ],
            'reviews' => [
                'heading' => 'Reseñas',
                'content' => [
                    'Las reseñas todavía no están disponibles. Cuando lleguen, se regirán por la política de reseñas, que ya se puede leer.',
                ],
            ],
            'intellectual-property' => [
                'heading' => 'Propiedad intelectual',
                'content' => [
                    [
                        'El nombre Vení, su logo, su diseño y el software del sitio son de su autor.',
                        'Los datos del mapa y de algunos locales son de OpenStreetMap (© colaboradores de OpenStreetMap) y se usan bajo la Open Database License (ODbL); la parte de nuestra base que viene de allí se entrega a quien la pida, bajo la misma licencia.',
                        'Los íconos son de colombia-icons (licencia MIT), MapLibre GL JS dibuja el mapa (licencia BSD de 3 cláusulas) y las tipografías se usan bajo la SIL Open Font License. El detalle está en Créditos.',
                        'Los nombres, logos, fotos y menús de cada restaurante son del restaurante, que autoriza mostrarlos.',
                    ],
                ],
            ],
            'third-parties' => [
                'heading' => 'Enlaces a otros servicios',
                'content' => [
                    'Vení enlaza a WhatsApp, Google Maps, Waze y OpenStreetMap. Al abrirlos, salís de Vení y rigen sus propios términos y políticas. No respondemos por cómo funcionan esos servicios.',
                ],
            ],
            'availability' => [
                'heading' => 'Disponibilidad',
                'content' => [
                    'Vení es un proyecto en construcción. Podemos cambiar, pausar o quitar funciones, y el sitio puede no estar disponible a ratos por mantenimiento, fallas o falta de señal. La app guarda una parte para usarla sin conexión, pero lo guardado puede estar desactualizado.',
                ],
            ],
            'liability' => [
                'heading' => 'Responsabilidad',
                'content' => [
                    'Respondemos por lo que depende de nosotros: que el sitio funcione con cuidado razonable y que tratemos los datos como dice la política de tratamiento de datos. No respondemos por los pedidos, productos, precios ni la atención de los restaurantes, por información que un negocio publique o deje de actualizar, ni por los servicios de terceros que abrás desde Vení.',
                    'Nada de estos términos te quita los derechos que te da la ley colombiana, incluidos los del Estatuto del Consumidor.',
                ],
            ],
            'changes' => [
                'heading' => 'Cambios y ley aplicable',
                'content' => [
                    'Podemos actualizar estos términos; la versión y la fecha vigentes aparecen arriba, y si el cambio es importante lo avisaremos en el sitio. Seguir usando Vení después de un cambio significa que aceptás la versión nueva.',
                    'Estos términos se rigen por las leyes de Colombia. Si surge un desacuerdo, primero intentemos resolverlo hablando: escribinos a :email.',
                ],
            ],
        ],
    ],

    'reviews' => [
        'title' => 'Política de reseñas',
        'description' => 'Cómo serán las reseñas verificadas de Vení Roldanillo: quién puede reseñar, cómo se verifican, qué se modera, qué se elimina y cómo responde un restaurante.',
        'intro' => 'Las reseñas todavía no existen en Vení. Esta es la política que las va a regir cuando lleguen, publicada desde ya para que restaurantes y visitantes sepan las reglas antes de empezar. Si algo cambia al construirlas, esta página se actualiza antes de abrirlas.',
        'sections' => [
            'principles' => [
                'heading' => 'Lo que buscamos',
                'content' => [
                    'Reseñas útiles y confiables, de personas que de verdad pidieron o visitaron el restaurante, sin que tengan que hacer pasos de más para demostrarlo. Una reseña negativa honesta vale tanto como una positiva.',
                ],
            ],
            'who' => [
                'heading' => 'Quién puede reseñar',
                'content' => [
                    [
                        'Personas con una cuenta verificada con su celular: una cuenta por celular.',
                        'Una reseña por persona y restaurante.',
                        'Los dueños y empleados de un restaurante no pueden reseñar ese restaurante.',
                        'Las cuentas nuevas esperan entre 24 y 48 horas antes de que su primera reseña se publique.',
                    ],
                ],
            ],
            'verification' => [
                'heading' => 'Cómo se verifican',
                'content' => [
                    'Cada reseña lleva señales de que la experiencia fue real, combinadas en un puntaje de confianza que no es público: por ejemplo, haber pedido por WhatsApp y confirmar «Sí, pedí», haber estado cerca del local o haber tocado el sticker de la mesa. Las reseñas con más señales pesan más en el promedio, y algunas llevan una insignia como «Pedido verificado» o «Visitó el local».',
                    'Para verificar una visita se usa tu ubicación en el teléfono y en el servidor queda solo el resultado (sí o no), nunca tus coordenadas. Cuando esto exista, la política de tratamiento de datos lo explicará con detalle antes de que te pidamos cualquier dato.',
                ],
            ],
            'content' => [
                'heading' => 'Qué se puede publicar',
                'content' => [
                    'Contá tu experiencia: la comida, la atención, el tiempo de entrega, el lugar. Se vale criticar con respeto. No se publican reseñas que:',
                    [
                        'Insulten, acosen o discriminen a personas.',
                        'Incluyan datos personales de otras personas (nombres completos de empleados, teléfonos, direcciones) o fotos de personas sin su permiso.',
                        'Sean falsas, de alguien que no tuvo la experiencia, o estén pagadas, pedidas a cambio de algo o escritas por la competencia.',
                        'Hablen de otra cosa: publicidad, política, enlaces o temas que no tienen que ver con el restaurante.',
                        'Infrinjan derechos de autor u otras leyes.',
                    ],
                ],
            ],
            'moderation' => [
                'heading' => 'Moderación',
                'content' => [
                    'Un sistema automático manda a revisión las reseñas sospechosas (ráfagas de reseñas, varias desde el mismo dispositivo, textos parecidos, ubicaciones incoherentes) y una persona del equipo decide. Cualquiera puede reportar una reseña.',
                    'Solo se elimina u oculta una reseña si incumple esta política. Nunca se elimina por ser negativa, ni porque el restaurante lo pida o pague: el plan pago de un restaurante nunca oculta ni borra reseñas. Si quitamos tu reseña, te decimos por qué y podés pedir que se revise de nuevo.',
                ],
            ],
            'reply' => [
                'heading' => 'Derecho de réplica del restaurante',
                'content' => [
                    'Cada restaurante puede responder públicamente las reseñas desde su panel, y su respuesta se muestra debajo de la reseña. La respuesta sigue las mismas reglas: sin insultos ni datos personales de quien reseñó.',
                    'Si un restaurante cree que una reseña incumple esta política, la puede reportar; no la puede borrar.',
                ],
            ],
            'private-channel' => [
                'heading' => 'Avisos privados',
                'content' => [
                    'Si tu experiencia fue mala, se te ofrecerá además avisarle en privado al restaurante para que lo pueda arreglar. Ese aviso nunca reemplaza tu reseña pública: la decisión de publicarla sigue siendo tuya.',
                ],
            ],
            'incentives' => [
                'heading' => 'Sin premios a cambio de estrellas',
                'content' => [
                    'Está prohibido que un restaurante ofrezca descuentos, regalos o premios a cambio de reseñas con buena calificación, o que condicione algo a la calificación. Si pasa, las reseñas afectadas se quitan del promedio y el restaurante puede perder beneficios en Vení. Esto también protege la publicidad veraz que exige el Estatuto del Consumidor.',
                ],
            ],
            'rating' => [
                'heading' => 'Cómo se calcula la calificación',
                'content' => [
                    'El promedio da más peso a las reseñas recientes y verificadas, y siempre se muestra junto a la cantidad de reseñas. Lo patrocinado se marca como «Patrocinado» y nunca cambia la calificación.',
                ],
            ],
            'changes' => [
                'heading' => 'Cambios',
                'content' => [
                    'Esta política se publica antes de que existan las reseñas y se puede ajustar al construirlas. Cada versión muestra su número y su fecha arriba. Para dudas o reportes, escribinos a :email.',
                ],
            ],
        ],
    ],

];
