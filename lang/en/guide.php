<?php

/*
| The typical dishes guide (#21): /dishes. Same keys as lang/es/guide.php,
| which is the reference text (see the notes there). `search` stays in
| Spanish: it is what the home search looks for in the restaurants' menus.
*/

return [
    'title' => 'Typical dishes guide',
    'description' => 'What sancocho, pandebono, champús or cholado are, when people eat them and where to find them in Roldanillo: the typical dishes and drinks of Valle del Cauca, explained by Vení.',
    'intro' => 'Roldanillo eats what Valle del Cauca eats: hearty soups from big pots, fried plantain, cassava and cheese breads, and cold drinks for the heat. Here is what each one is and when people order it, so you know what to ask for. And if you get a craving, look up who serves it today.',
    'note' => 'The Vení team wrote this guide. Every home and every kitchen has its own recipe: what you read here is the most common way, not the only one.',
    'toc' => 'In this guide',
    'when' => 'When people eat it',
    'tip' => 'For visitors',
    'search_link' => 'Find where it is served',

    'sections' => [
        'almuerzo' => [
            'heading' => 'For lunch',
            'dishes' => [
                'sancocho-de-gallina' => [
                    'name' => 'Sancocho de gallina (hen soup)',
                    'search' => 'sancocho',
                    'summary' => 'A thick hen soup with plantain, cassava and corn on the cob, slow-cooked in a big pot. It comes with rice, avocado and ají (a fresh chili sauce), and the piece of hen is often served on a separate plate.',
                    'when' => 'At lunch, especially on Sundays, and on family outings to the river where the soup is cooked on site.',
                    'tip' => 'It is a full meal: with a sancocho you do not need to order anything else. If the hen comes on the side, eat it with the rice.',
                ],
                'arroz-atollado' => [
                    'name' => 'Arroz atollado (soupy rice)',
                    'search' => 'arroz atollado',
                    'summary' => 'Moist, creamy rice cooked with pork, chicken, longaniza or chorizo sausage, potato and hogao (a tomato and onion sauce). «Atollado» means it stays juicy, never loose.',
                    'when' => 'At lunch and at big gatherings, because it is cooked in large batches.',
                    'tip' => 'Do not expect dry rice: it is closer to a stew. It is filling, so one serving is enough.',
                ],
                'tamal' => [
                    'name' => 'Tamal',
                    'search' => 'tamal',
                    'summary' => 'Corn dough with meats, vegetables and egg, wrapped in a plantain leaf and cooked for hours. Every family makes it its own way.',
                    'when' => 'For breakfast, mostly on weekends and in December, with hot chocolate.',
                    'tip' => 'The plantain leaf is not eaten: unwrap it and eat what is inside. With hot chocolate and an arepa or bread, it is a Sunday breakfast.',
                ],
            ],
        ],

        'desayuno' => [
            'heading' => 'For breakfast and the afternoon snack',
            'dishes' => [
                'pandebono' => [
                    'name' => 'Pandebono (cheese bread)',
                    'search' => 'pandebono',
                    'summary' => 'A small bread made with cassava starch and cheese, golden outside and soft inside. It is one of the most typical flavors of the Valle.',
                    'when' => 'For breakfast or the «algo», the afternoon snack, with coffee, hot chocolate or a drink made with oats.',
                    'tip' => 'Fresh out of the oven it is a different thing: ask when the next batch comes out.',
                ],
                'pandeyuca' => [
                    'name' => 'Pandeyuca (cassava bread)',
                    'search' => 'pandeyuca',
                    'summary' => 'A cousin of pandebono, also made with cassava starch and cheese, but lighter and chewier. It usually comes in a horseshoe or ring shape.',
                    'when' => 'Like pandebono: for breakfast or the afternoon snack, with a hot drink.',
                    'tip' => 'If pandebono felt heavy, try this one. Eat it warm.',
                ],
                'empanadas-vallunas' => [
                    'name' => 'Empanadas vallunas (corn turnovers)',
                    'search' => 'empanada',
                    'summary' => 'Thin, crunchy corn dough turnovers filled with potato and meat. They are not complete without ají.',
                    'when' => 'At any time: for breakfast, between meals or at night.',
                    'tip' => 'Homemade ají is sometimes spicy: try a little before adding a lot.',
                ],
                'aborrajados' => [
                    'name' => 'Aborrajados (stuffed ripe plantain)',
                    'search' => 'aborrajado',
                    'summary' => 'Slices of ripe plantain filled with cheese (sometimes with guava paste too), dipped in a flour and egg batter and fried. Sweet and savory at the same time.',
                    'when' => 'As a starter at lunch or as an afternoon snack.',
                    'tip' => 'Order them hot, while the cheese is still melted.',
                ],
                'marranitas' => [
                    'name' => 'Marranitas (green plantain balls)',
                    'search' => 'marranita',
                    'summary' => 'Balls of fried and mashed green plantain, filled with chicharrón (crispy pork). Crunchy outside, firm inside.',
                    'when' => 'For breakfast or as a snack.',
                    'tip' => 'They are filling: one or two are enough for a snack.',
                ],
            ],
        ],

        'bebidas' => [
            'heading' => 'Drinks, fruit and sweets',
            'dishes' => [
                'champus' => [
                    'name' => 'Champús (corn and fruit drink)',
                    'search' => 'champús',
                    'summary' => 'A thick, cold drink of cooked corn, lulo, pineapple and panela (unrefined cane sugar), with spices such as cinnamon and clove. You drink it with a spoon or in sips, depending on how thick it is.',
                    'when' => 'All year round, and even more in December and during festivities.',
                    'tip' => 'It has whole corn kernels: you almost chew it. Ask for it very cold.',
                ],
                'lulada' => [
                    'name' => 'Lulada (lulo drink)',
                    'search' => 'lulada',
                    'summary' => 'Lulo fruit mashed, not blended, with ice, sugar and lime. It keeps small pieces of fruit and a refreshing sour taste.',
                    'when' => 'Whenever the heat is strong, at any time.',
                    'tip' => 'Lulo is sour: if you want it less sweet, ask for little sugar.',
                ],
                'cholado' => [
                    'name' => 'Cholado (shaved ice with fruit)',
                    'search' => 'cholado',
                    'summary' => 'Shaved ice with chopped fruit, colorful syrups and condensed milk, often topped with a cookie or a wafer. It is a dessert and a cold drink at once.',
                    'when' => 'In the afternoon, for the heat, and on any outing.',
                    'tip' => 'Servings are big: you can share one.',
                ],
                'salpicon' => [
                    'name' => 'Salpicón (fruit cocktail)',
                    'search' => 'salpicón',
                    'summary' => 'Chopped fruit in juice, sometimes topped with ice cream or cream. You start with a spoon and end up drinking it.',
                    'when' => 'In the afternoon, as something cold for the heat.',
                    'tip' => 'Here salpicón is made with fruit, not the meat dish that has the same name in other countries.',
                ],
                'chontaduro' => [
                    'name' => 'Chontaduro (peach palm fruit)',
                    'search' => 'chontaduro',
                    'summary' => 'The fruit of a palm tree, cooked and sold on the street with salt, honey or both. It has a starchy texture and a taste unlike any other.',
                    'when' => 'At any time, from street carts.',
                    'tip' => 'Try it with an open mind: start with salt and honey, the way most people order it.',
                ],
                'manjar-blanco' => [
                    'name' => 'Manjar blanco (milk and rice sweet)',
                    'search' => 'manjar blanco',
                    'summary' => 'A sweet made of milk and rice cooked for hours with sugar, stirred non-stop until it thickens. It is one of the most traditional sweets of the Valle.',
                    'when' => 'All year round in sweet shops; in December many homes always have it.',
                    'tip' => 'It is very sweet: a small serving goes a long way.',
                ],
                'desamargado' => [
                    'name' => 'Desamargado (citrus peel sweet)',
                    'search' => 'desamargado',
                    'summary' => 'A sweet of fruit and citrus peels in syrup. Before cooking, the bitterness is taken out of them, hence the name («desamargar» means to remove the bitterness).',
                    'when' => 'Mostly in December, among the sweets of the season.',
                    'tip' => 'It is sweet and fragrant: people eat it a little at a time, in small servings.',
                ],
            ],
        ],
    ],
];
