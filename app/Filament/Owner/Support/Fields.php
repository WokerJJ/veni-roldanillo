<?php

namespace App\Filament\Owner\Support;

use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;

/**
 * Campos que se repiten en los formularios del panel del dueño, con las
 * mismas reglas en todos: los textos se guardan sin espacios a los lados y
 * uno obligatorio no puede ser solo espacios (tampoco los de Unicode, como
 * el espacio duro); los precios son pesos enteros.
 */
final class Fields
{
    /** Al menos un carácter que no sea espacio, de ningún tipo. */
    public const NOT_BLANK = '/[^\s\p{Z}]/u';

    /** Tope de un precio o un costo en pesos (dos millones). */
    public const MAX_PRICE = 2_000_000;

    public static function text(string $name, string $label, int $maxLength, bool $required = false): TextInput
    {
        $field = TextInput::make($name)
            ->label($label)
            ->maxLength($maxLength)
            ->dehydrateStateUsing(fn (?string $state): ?string => self::clean($state));

        return $required ? $field->required()->regex(self::NOT_BLANK) : $field;
    }

    public static function longText(string $name, string $label, int $maxLength): Textarea
    {
        return Textarea::make($name)
            ->label($label)
            ->rows(3)
            ->maxLength($maxLength)
            ->dehydrateStateUsing(fn (?string $state): ?string => self::clean($state));
    }

    public static function pesos(string $name, string $label, int $max = self::MAX_PRICE): TextInput
    {
        return TextInput::make($name)
            ->label($label)
            ->required()
            ->integer()
            ->minValue(0)
            ->maxValue($max)
            ->prefix('$');
    }

    public static function position(): TextInput
    {
        return TextInput::make('position')
            ->label(__('panel.fields.position'))
            ->helperText(__('panel.fields.position_help'))
            ->integer()
            ->minValue(0)
            ->maxValue(1000)
            ->default(0)
            ->required();
    }

    /** Sin espacios a los lados; vacío queda nulo. */
    public static function clean(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }
}
