<?php

namespace App\Support\Field;

use App\Models\Category;
use App\Models\FieldSubmission;

/**
 * El mensaje de WhatsApp que el administrador le manda al dueño (ADR 0048):
 * el resumen de lo capturado y el enlace de confirmación. Siempre en español,
 * que es como se habla en el local. Se arma en el servidor para que el
 * resumen sea exactamente lo guardado. No se manda solo: abre `wa.me` en el
 * teléfono del administrador y él toca «Enviar».
 */
final class ConfirmationMessage
{
    public const string LOCALE = 'es';

    public static function text(FieldSubmission $submission, string $url): string
    {
        $t = self::line(...);
        $payload = $submission->payload;

        $categories = Category::query()->whereIn('id', $payload['category_ids'])->orderBy('position')->get()
            ->map(fn (Category $category): string => (string) $category->name_es)->implode(', ');
        $payments = collect($payload['payment_methods'])
            ->map(fn (string $method): string => __("field.payments.{$method}", [], self::LOCALE))->implode(', ');

        $lines = [
            $t('greeting', ['owner' => $submission->owner_name, 'name' => $payload['name']]),
            '',
            $t('summary'),
            $t('line_address', ['value' => $payload['address']]),
            $t('line_categories', ['value' => $categories]),
        ];

        if ($payload['phone'] !== null) {
            $lines[] = $t('line_phone', ['value' => $payload['phone']]);
        }

        if ($payload['whatsapp'] !== null) {
            $lines[] = $t('line_whatsapp', ['value' => '+'.$payload['whatsapp']]);
        }

        $lines[] = $t('line_delivery', ['value' => $t($payload['delivery'] ? 'yes' : 'no')]);

        if ($payments !== '') {
            $lines[] = $t('line_payments', ['value' => $payments]);
        }

        $hours = self::hoursLines($payload['hours']);

        if ($hours !== []) {
            $lines[] = $t('line_hours');
            array_push($lines, ...$hours);
        }

        array_push($lines, '', $t('call_to_action', ['days' => FieldSubmission::CONFIRMATION_DAYS]), $url);

        return implode("\n", $lines);
    }

    /**
     * @param  array<string, string|int>  $replace
     */
    private static function line(string $key, array $replace = []): string
    {
        return __("field.whatsapp.{$key}", $replace, self::LOCALE);
    }

    public static function whatsappUrl(FieldSubmission $submission, string $url): string
    {
        return 'https://wa.me/'.$submission->owner_phone.'?text='.rawurlencode(self::text($submission, $url));
    }

    /**
     * Las franjas por día, en el orden de la semana colombiana (lunes primero).
     *
     * @param  list<array{weekday: int, opens: string, closes: string}>  $slots
     * @return list<string>
     */
    public static function hoursLines(array $slots, string $locale = self::LOCALE): array
    {
        /** @var list<string> $names */
        $names = trans('field.days', [], $locale);
        $byDay = [];

        foreach ($slots as $slot) {
            $byDay[$slot['weekday']][] = "{$slot['opens']}–{$slot['closes']}";
        }

        $lines = [];

        foreach ([1, 2, 3, 4, 5, 6, 0] as $day) {
            if (isset($byDay[$day])) {
                $lines[] = '• '.$names[$day].': '.implode(', ', $byDay[$day]);
            }
        }

        return $lines;
    }
}
