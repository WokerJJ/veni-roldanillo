<?php

namespace App\Http\Requests;

use App\Providers\AppServiceProvider;
use App\Rules\PlainText;
use App\Support\ColombianMobile;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Lo que comparten «Reclámalo» y «Pedir que retiren esta ficha» (#20, ADR
 * 0026): un contacto mínimo (nombre, celular y correo opcional), la
 * autorización expresa del tratamiento de datos y un campo trampa.
 *
 * El campo trampa (`website`) va escondido en el formulario: una persona no
 * lo ve ni lo llena; un bot que llena todo, sí. Con algo escrito, el
 * controlador responde como si hubiera guardado, sin guardar nada.
 */
abstract class RestaurantContactRequest extends FormRequest
{
    /** Nombre del campo trampa: el formulario lo esconde de las personas. */
    public const HONEYPOT = 'website';

    public const NAME_MAX = 100;

    public const EMAIL_MAX = 254;

    public const TEXT_MAX = 1000;

    /**
     * Versión del aviso de privacidad que acepta quien envía (Ley 1581): se
     * guarda en cada solicitud. Cambiar el texto de `requests.privacy_*` o el
     * responsable exige subirla.
     */
    public const PRIVACY_NOTICE_VERSION = '2026-10-26';

    /** Quién responde por los datos (el aviso lo nombra). */
    public const PRIVACY_CONTROLLER = 'Vení Roldanillo';

    /** Algo que no sea solo espacios, tampoco los de Unicode. */
    protected const NOT_BLANK = 'regex:/[^\s\p{Z}]/u';

    public function authorize(): bool
    {
        return true;
    }

    /** El celular como lo guarda la base; si no se puede, tal cual, para que la regla lo rechace. */
    protected function prepareForValidation(): void
    {
        $phone = $this->input('contact_phone');

        $this->merge(['contact_phone' => ColombianMobile::normalize($phone) ?? $phone]);
    }

    /**
     * El tope por celular (ADR 0026) cuenta solo los envíos válidos: uno con
     * errores no gasta el cupo del dueño real del número. El límite por IP
     * (AppServiceProvider) sí cuenta todos.
     */
    protected function passedValidation(): void
    {
        $key = self::phoneThrottleKey($this->string('contact_phone')->toString());

        if (RateLimiter::tooManyAttempts($key, AppServiceProvider::RESTAURANT_REQUESTS_PER_DAY_PER_PHONE)) {
            throw new HttpResponseException(response(__('requests.error.too_many'), 429, [
                'Retry-After' => RateLimiter::availableIn($key),
                'Content-Type' => 'text/plain; charset=UTF-8',
            ]));
        }

        RateLimiter::hit($key, 60 * 60 * 24);
    }

    /**
     * Clave del tope por celular: un HMAC con la clave de la app, no el
     * número ni un hash sin secreto (los celulares son pocos y se adivinan).
     */
    public static function phoneThrottleKey(string $phone): string
    {
        return 'restaurant-requests:phone:'.hash_hmac('sha256', $phone, config()->string('app.key'));
    }

    /** Si llenó el campo trampa: se responde como siempre, sin guardar. */
    public function isLikelyBot(): bool
    {
        return $this->filled(self::HONEYPOT);
    }

    /**
     * @return array<string, mixed>
     */
    protected function contactRules(): array
    {
        return [
            'contact_name' => ['required', 'string', new PlainText, 'max:'.self::NAME_MAX, self::NOT_BLANK],
            'contact_phone' => ['required', 'string', 'regex:/^573\d{9}$/'],
            'contact_email' => ['nullable', 'string', new PlainText, 'max:'.self::EMAIL_MAX, 'email:rfc'],
            'accepts_privacy' => ['accepted'],
            self::HONEYPOT => ['nullable', 'string', new PlainText, 'max:500'],
        ];
    }

    /**
     * Un aviso por campo, sea cual sea la regla que falló: dice qué escribir.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'contact_name' => __('requests.error.name', ['max' => self::NAME_MAX]),
            'contact_phone' => __('requests.error.phone'),
            'contact_email' => __('requests.error.email'),
            'accepts_privacy' => __('requests.error.privacy'),
            self::HONEYPOT => __('requests.error.failed'),
        ];
    }
}
