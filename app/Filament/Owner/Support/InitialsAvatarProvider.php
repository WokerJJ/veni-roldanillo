<?php

namespace App\Filament\Owner\Support;

use Filament\AvatarProviders\Contracts\AvatarProvider;
use Filament\Facades\Filament;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * Avatar con las iniciales, armado aquí como un SVG en una URL data:. El de
 * Filament por defecto lo pide a ui-avatars.com: mandaría el nombre de la
 * persona y del restaurante a un tercero, y la CSP lo bloquea (ADR 0025).
 */
final class InitialsAvatarProvider implements AvatarProvider
{
    public function get(Model $record): string
    {
        $name = Filament::getNameForDefaultAvatar($record);
        $initials = Str::of($name)
            ->replaceMatches('/\(.*?\)/u', '')
            ->explode(' ')
            ->filter()
            ->take(2)
            ->map(fn (string $word): string => mb_strtoupper(mb_substr($word, 0, 1)))
            ->implode('');

        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            .'<rect width="64" height="64" fill="#2A1638"/>'
            .'<text x="32" y="40" font-family="sans-serif" font-size="24" font-weight="700" fill="#FFFFFF" text-anchor="middle">'
            .e($initials)
            .'</text></svg>';

        return 'data:image/svg+xml;base64,'.base64_encode($svg);
    }
}
