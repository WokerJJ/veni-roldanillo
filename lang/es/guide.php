<?php

/*
| La guía de platos típicos (#21): /dishes. Texto propio del equipo de Vení.
|
| Viaja como prop solo a su página (DishGuideController), como los documentos
| legales (ADR 0030): no va en lang/es.json, que el navegador recibe entero en
| la primera visita. lang/en/guide.php tiene las mismas claves (lo prueba
| tests/Feature/DishGuidePageTest.php).
|
| Son entre 10 y 15 platos, el rango que pide el issue #21 (lo prueba
| tests/Feature/DishGuidePageTest.php). Cada sección agrupa platos; la clave
| de la sección y la de cada plato son sus anclas en la página. `search` es lo que se busca en el inicio con
| «Buscar dónde lo sirven» (/?q=…): va en español en los dos idiomas, porque
| los menús de los restaurantes están en español.
*/

return [
    'title' => 'Guía de platos típicos',
    'description' => 'Qué es el sancocho, el pandebono, el champús o el cholado, cuándo se comen y dónde los sirven en Roldanillo: los platos y bebidas típicos del Valle del Cauca, contados por Vení.',
    'intro' => 'En Roldanillo se come lo que se come en el Valle del Cauca: sopas de olla grande, fritos de plátano, panes de yuca y queso, y bebidas para el calor. Acá te contamos qué es cada cosa y cuándo se pide, para que llegués sabiendo. Y si se te antoja, buscá quién lo sirve hoy.',
    'note' => 'Esta guía la escribió el equipo de Vení. Cada casa y cada cocina tiene su receta: lo que leés acá es lo más común, no la única forma de hacerlo.',
    'toc' => 'En esta guía',
    'when' => 'Cuándo se come',
    'tip' => 'Si venís de visita',
    'search_link' => 'Buscar dónde lo sirven',

    'sections' => [
        'almuerzo' => [
            'heading' => 'Para almorzar',
            'dishes' => [
                'sancocho-de-gallina' => [
                    'name' => 'Sancocho de gallina',
                    'search' => 'sancocho',
                    'summary' => 'Una sopa espesa de gallina con plátano, yuca y mazorca, cocinada despacio en olla grande. Se acompaña con arroz, aguacate y ají, y muchas veces la presa llega en plato aparte.',
                    'when' => 'Al almuerzo, sobre todo los domingos, y en los paseos de olla al río con la familia.',
                    'tip' => 'Es una comida completa: con un sancocho no hace falta pedir nada más. Si te sirven la presa aparte, se come con el arroz.',
                ],
                'arroz-atollado' => [
                    'name' => 'Arroz atollado',
                    'search' => 'arroz atollado',
                    'summary' => 'Arroz húmedo y cremoso, cocinado con carne de cerdo, pollo, longaniza o chorizo, papa y hogao. «Atollado» quiere decir que queda jugoso, nada suelto.',
                    'when' => 'Al almuerzo y en reuniones grandes, porque se hace en cantidad.',
                    'tip' => 'No esperés un arroz seco: se parece más a un guiso. Es contundente, así que una porción alcanza.',
                ],
            ],
        ],

        'desayuno' => [
            'heading' => 'Para el desayuno y el algo',
            'dishes' => [
                'pandebono' => [
                    'name' => 'Pandebono',
                    'search' => 'pandebono',
                    'summary' => 'Un pan pequeño de almidón de yuca y queso, dorado por fuera y blandito por dentro. Es uno de los sabores más vallunos que hay.',
                    'when' => 'Al desayuno o al algo de la tarde, con café, chocolate o avena.',
                    'tip' => 'Recién salido del horno es otra cosa: preguntá a qué hora sale la próxima tanda.',
                ],
                'pandeyuca' => [
                    'name' => 'Pandeyuca',
                    'search' => 'pandeyuca',
                    'summary' => 'Primo del pandebono, también de almidón de yuca y queso, pero más liviano y elástico. Suele venir en forma de herradura o de rosca.',
                    'when' => 'Igual que el pandebono: al desayuno o al algo, con una bebida caliente.',
                    'tip' => 'Si el pandebono te pareció pesado, probá este. Se come caliente.',
                ],
                'empanadas-vallunas' => [
                    'name' => 'Empanadas vallunas',
                    'search' => 'empanada',
                    'summary' => 'Empanadas de masa de maíz, delgadas y crujientes, rellenas de papa con carne. Sin ají no están completas.',
                    'when' => 'A cualquier hora: al desayuno, entre comidas o de noche.',
                    'tip' => 'El ají casero es picante a veces: probá un poquito antes de echarle mucho.',
                ],
                'aborrajados' => [
                    'name' => 'Aborrajados',
                    'search' => 'aborrajado',
                    'summary' => 'Tajadas de plátano maduro rellenas de queso (a veces también de bocadillo de guayaba), pasadas por una masa de harina y huevo y fritas. Dulces y saladas al mismo tiempo.',
                    'when' => 'De entrada en el almuerzo o para picar en la tarde.',
                    'tip' => 'Pedilos calientes, cuando el queso todavía está derretido.',
                ],
                'marranitas' => [
                    'name' => 'Marranitas',
                    'search' => 'marranita',
                    'summary' => 'Bolitas de plátano verde frito y machacado, rellenas de chicharrón. Crujientes por fuera, firmes por dentro.',
                    'when' => 'Al desayuno o para picar.',
                    'tip' => 'Llenan bastante: con una o dos tenés para el antojo.',
                ],
                'tamal' => [
                    'name' => 'Tamal',
                    'search' => 'tamal',
                    'summary' => 'Masa de maíz con carnes, verduras y huevo, envuelta en hoja de plátano y cocida por horas. Cada familia le pone lo suyo.',
                    'when' => 'Al desayuno, más que todo los fines de semana y en diciembre, con chocolate caliente.',
                    'tip' => 'La hoja de plátano no se come: abrila y comé lo de adentro. Con chocolate y arepa o pan es el desayuno de domingo.',
                ],
            ],
        ],

        'bebidas' => [
            'heading' => 'Bebidas, frutas y dulces',
            'dishes' => [
                'champus' => [
                    'name' => 'Champús',
                    'search' => 'champús',
                    'summary' => 'Una bebida espesa y fría de maíz cocido, lulo, piña y panela, con especias como canela y clavo. Se toma con cuchara o a sorbos, según lo espeso.',
                    'when' => 'Todo el año, y con más ganas en diciembre y en las fiestas.',
                    'tip' => 'Trae granos de maíz enteros: es casi para masticar. Pedilo bien frío.',
                ],
                'lulada' => [
                    'name' => 'Lulada',
                    'search' => 'lulada',
                    'summary' => 'Lulo machacado, no licuado, con hielo, azúcar y limón. Queda con pedacitos de fruta y un sabor ácido que refresca.',
                    'when' => 'Cuando aprieta el calor, a cualquier hora.',
                    'tip' => 'Es ácida y refresca: si la querés menos dulce, pedila con poca azúcar.',
                ],
                'cholado' => [
                    'name' => 'Cholado',
                    'search' => 'cholado',
                    'summary' => 'Hielo raspado con fruta picada, jarabes de colores y leche condensada; muchas veces lleva galleta o barquillo encima. Es postre y refresco a la vez.',
                    'when' => 'En la tarde, para el calor, y en cualquier paseo.',
                    'tip' => 'Las porciones son grandes: se puede compartir.',
                ],
                'salpicon' => [
                    'name' => 'Salpicón',
                    'search' => 'salpicón',
                    'summary' => 'Fruta picada bañada en jugo, a veces con helado o crema encima. Se come con cuchara y se termina tomando.',
                    'when' => 'De tarde, como algo frío para el calor.',
                    'tip' => 'Acá el salpicón es de frutas, no el plato de carne que lleva ese nombre en otros países.',
                ],
                'chontaduro' => [
                    'name' => 'Chontaduro',
                    'search' => 'chontaduro',
                    'summary' => 'El fruto de una palma, cocido, que se vende en la calle con sal, con miel o con las dos. Tiene una textura harinosa y un sabor que no se parece a otro.',
                    'when' => 'A cualquier hora, en los carritos de la calle.',
                    'tip' => 'Es un sabor para probar sin prejuicios: empezá con sal y miel, como se suele pedir.',
                ],
                'manjar-blanco' => [
                    'name' => 'Manjar blanco',
                    'search' => 'manjar blanco',
                    'summary' => 'Un dulce de leche y arroz cocinado por horas con azúcar, revolviendo sin parar hasta que espesa. Es uno de los dulces más tradicionales del Valle.',
                    'when' => 'Todo el año en las dulcerías; en diciembre no falta en muchas casas.',
                    'tip' => 'Es muy dulce: una porción pequeña rinde.',
                ],
                'desamargado' => [
                    'name' => 'Desamargado',
                    'search' => 'desamargado',
                    'summary' => 'Un dulce de frutas y cáscaras de cítricos en almíbar. Antes de cocinarlas se les quita lo amargo, y de ahí el nombre.',
                    'when' => 'Sobre todo en diciembre, entre los dulces de la temporada.',
                    'tip' => 'Es dulce y aromático: se come de a poquito, en porciones pequeñas.',
                ],
            ],
        ],
    ],
];
