<?php

namespace App\Http\Controllers;

use App\Enums\LegalDocument;
use App\Enums\Locale;
use App\Http\Requests\RestaurantContactRequest;
use Carbon\CarbonImmutable;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Las páginas legales (#23, ADR 0030): la política de tratamiento de datos,
 * los términos de uso y la política de reseñas.
 *
 * El texto sale de lang/{idioma}/documents.php y viaja como prop solo a su
 * página: no entra en lang/{idioma}.json, que el navegador recibe entero en
 * la primera visita (ADR 0010). Cada sección es una lista de bloques: un
 * texto es un párrafo; una lista de textos, una lista con viñetas.
 */
class LegalDocumentController extends Controller
{
    public function __invoke(LegalDocument $document): Response
    {
        $locale = Locale::current();
        $text = $this->text($document);
        $date = $document->effectiveDate();
        // Con un idioma, locale() devuelve la fecha; sin él, el idioma actual.
        $localizedDate = $date->locale($locale->value);
        assert($localizedDate instanceof CarbonImmutable);

        $sections = [];
        foreach ($text['sections'] as $id => $section) {
            $sections[] = [
                'id' => $id,
                'heading' => $section['heading'],
                'blocks' => array_map(
                    fn (string|array $block): array => is_string($block)
                        ? ['kind' => 'paragraph', 'text' => $block]
                        : ['kind' => 'list', 'items' => $block],
                    $section['content'],
                ),
            ];
        }

        return Inertia::render('Legal', [
            'document' => [
                'key' => $document->value,
                'title' => $text['title'],
                'intro' => $text['intro'],
                'version' => $document->version(),
                'effective_date' => $date->toDateString(),
                'effective_date_label' => $localizedDate->isoFormat('LL'),
                'sections' => $sections,
            ],
            'draft' => config()->boolean('legal.draft_notice'),
            'contactEmail' => config()->string('privacy.contact_email'),
            'related' => array_values(array_map(
                fn (LegalDocument $other): array => [
                    'key' => $other->value,
                    'href' => route($other->routeName(), absolute: false),
                ],
                array_filter(LegalDocument::cases(), fn (LegalDocument $other): bool => $other !== $document),
            )),
            // El título y la descripción del documento (SEO): la vista raíz
            // los escribe en el HTML y la página los mantiene al navegar.
            'meta' => [
                'title' => $text['title'],
                'description' => $text['description'],
            ],
        ]);
    }

    /**
     * El texto del documento en el idioma de la petición, con el responsable
     * y el correo de contacto ya puestos.
     *
     * @return array{title: string, description: string, intro: string, sections: array<string, array{heading: string, content: list<string|list<string>>}>}
     */
    private function text(LegalDocument $document): array
    {
        /** @var array{title: string, description: string, intro: string, sections: array<string, array{heading: string, content: list<string|list<string>>}>} $text */
        $text = __($document->langKey(), [
            'controller' => RestaurantContactRequest::PRIVACY_CONTROLLER,
            'email' => config()->string('privacy.contact_email'),
        ]);

        return $text;
    }
}
