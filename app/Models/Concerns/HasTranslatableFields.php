<?php

namespace App\Models\Concerns;

use App\Enums\Locale;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/**
 * Campos de contenido con una columna por idioma (name_es, name_en…).
 *
 *     $dish->translated('name');             // idioma de la petición
 *     $dish->translated('name', Locale::En); // idioma explícito
 *
 * El español es obligatorio y el inglés opcional: si falta el inglés se
 * muestra el español antes que dejar el texto vacío (ADR 0010).
 *
 * @phpstan-require-extends Model
 */
trait HasTranslatableFields
{
    /**
     * Campos con versión por idioma, sin el sufijo: ['name', 'description'].
     *
     * @return list<string>
     */
    abstract public function translatableFields(): array;

    /**
     * Texto del campo en el idioma pedido (por defecto, el de la petición) o,
     * si está nulo o vacío, en español. Un campo no declarado es un error de
     * programación: lanza una excepción en vez de devolver null en silencio.
     */
    public function translated(string $field, ?Locale $locale = null): ?string
    {
        if (! in_array($field, $this->translatableFields(), true)) {
            throw new InvalidArgumentException(sprintf('«%s» no es un campo traducible de %s.', $field, static::class));
        }

        return $this->translationIn($field, $locale ?? Locale::current())
            ?? $this->translationIn($field, Locale::DEFAULT);
    }

    private function translationIn(string $field, Locale $locale): ?string
    {
        $value = $this->getAttribute("{$field}_{$locale->value}");

        return is_string($value) && trim($value) !== '' ? $value : null;
    }
}
