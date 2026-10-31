<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

/**
 * La guía de platos típicos (#21): qué es cada plato o bebida del Valle,
 * cuándo se come y un enlace para buscar en el inicio quién lo sirve.
 *
 * El texto sale de lang/{idioma}/guide.php y viaja como prop solo a esta
 * página, como los documentos legales (ADR 0030): no entra en
 * lang/{idioma}.json, que el navegador recibe entero en la primera visita
 * (ADR 0010). La página no consulta la base ni la API de búsqueda: el enlace
 * de cada plato lleva al inicio con la búsqueda puesta (/?q=…).
 */
class DishGuideController extends Controller
{
    /** El archivo de idioma de la guía (lang/{idioma}/guide.php). */
    public const string TEXT = 'guide';

    public function __invoke(): Response
    {
        /** @var array{title: string, description: string, intro: string, note: string, toc: string, when: string, tip: string, search_link: string, sections: array<string, array{heading: string, dishes: array<string, array{name: string, search: string, summary: string, when: string, tip: string}>}>} $text */
        $text = trans(self::TEXT);

        $sections = [];
        foreach ($text['sections'] as $sectionId => $section) {
            $dishes = [];
            foreach ($section['dishes'] as $dishId => $dish) {
                $dishes[] = ['id' => $dishId, ...$dish];
            }

            $sections[] = ['id' => $sectionId, 'heading' => $section['heading'], 'dishes' => $dishes];
        }

        return Inertia::render('DishGuide', [
            'guide' => [
                'title' => $text['title'],
                'intro' => $text['intro'],
                'note' => $text['note'],
                'labels' => [
                    'toc' => $text['toc'],
                    'when' => $text['when'],
                    'tip' => $text['tip'],
                    'search_link' => $text['search_link'],
                ],
                'sections' => $sections,
            ],
            // El título y la descripción (SEO): la vista raíz los escribe en
            // el HTML y useI18n los mantiene al navegar.
            'meta' => [
                'title' => $text['title'],
                'description' => $text['description'],
            ],
        ]);
    }
}
