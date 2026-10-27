<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Texto que una persona escribe en un formulario: UTF-8 válido y sin
 * caracteres de control (C0, DEL y C1), que nadie teclea y que la base no
 * guarda bien (PostgreSQL rechaza UTF-8 inválido con un 500 y el NUL corta el
 * texto). Un texto de varias líneas admite salto de línea, retorno de carro y
 * tabulación.
 *
 * Un valor que no es cadena lo deja pasar: eso lo dice la regla `string`.
 */
final class PlainText implements ValidationRule
{
    public function __construct(private readonly bool $multiline = false) {}

    public static function multiline(): self
    {
        return new self(multiline: true);
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            return;
        }

        $control = $this->multiline ? '/[^\P{Cc}\t\n\r]/u' : '/\p{Cc}/u';

        // Con UTF-8 inválido, preg_match con /u devuelve false.
        if (! mb_check_encoding($value, 'UTF-8') || preg_match($control, $value) !== 0) {
            $fail('validation.plain_text')->translate();
        }
    }
}
