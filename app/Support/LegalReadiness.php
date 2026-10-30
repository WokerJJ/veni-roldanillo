<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;

/**
 * Lo que falta para que la política de tratamiento de datos (/privacy, #23)
 * se pueda publicar: el Decreto 1377 de 2013 pide el nombre, el domicilio, el
 * correo y el teléfono del responsable, y mientras un abogado no revise los
 * textos sigue el aviso de borrador. En el repositorio todo eso es ficticio o
 * falta, a propósito; en producción, AppServiceProvider lo deja en el
 * registro al arrancar (como CSP_REPORT_ONLY), sin tumbar el sitio: un dato
 * legal pendiente no justifica apagar el directorio.
 */
final class LegalReadiness
{
    /**
     * Un aviso por cada dato pendiente, con la variable que lo arregla.
     *
     * @return list<string>
     */
    public static function problems(): array
    {
        $problems = [];
        $email = config('privacy.contact_email');
        $email = is_string($email) ? mb_strtolower(trim($email)) : '';

        if ($email === '' || str_ends_with($email, '.test') || preg_match('/@(.+\.)?example\.[a-z]+$/', $email) === 1) {
            $problems[] = 'Política de datos: VENI_PRIVACY_CONTACT_EMAIL es un correo de ejemplo; poné el buzón real del responsable.';
        }

        foreach (['holder' => 'el nombre legal', 'address' => 'el domicilio', 'phone' => 'el teléfono'] as $key => $label) {
            $value = config("privacy.controller.{$key}");

            if (! is_string($value) || trim($value) === '') {
                $problems[] = 'Política de datos: falta '.$label.' del responsable (VENI_PRIVACY_CONTROLLER_'.mb_strtoupper($key).'); la página dice «pendiente».';
            }
        }

        if (config('legal.draft_notice') === true) {
            $problems[] = 'Documentos legales: VENI_LEGAL_DRAFT_NOTICE sigue activo; se apaga cuando un abogado revise los textos y se suba su versión.';
        }

        return $problems;
    }

    /** En producción, cada pendiente queda en el registro como advertencia. */
    public static function report(): void
    {
        if (! app()->isProduction()) {
            return;
        }

        foreach (self::problems() as $problem) {
            Log::warning($problem);
        }
    }
}
