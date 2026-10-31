<?php

namespace App\Support;

use Illuminate\Http\Request;

/**
 * La huella de quien hace una petición pública, para los límites y el
 * conteo del pedido por WhatsApp (#22, ADR 0031): HMAC-SHA256 con APP_KEY de
 * la IP, o del prefijo /64 si es IPv6. Nunca la IP en claro ni un md5 que se
 * pueda revertir probando las 2^32 IPv4.
 *
 * Una IPv6 se agrupa por /64 porque es lo que un operador le da a un solo
 * cliente: sin eso, cada dirección del mismo celular contaría aparte. Una
 * IPv4 escrita como IPv6 (::ffff:a.b.c.d) se trata como esa IPv4.
 */
final class ClientFingerprint
{
    /** La IP, o el /64 si es IPv6. */
    public static function network(Request $request): string
    {
        $ip = (string) $request->ip();
        $packed = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false ? inet_pton($ip) : false;

        if ($packed === false || strlen($packed) !== 16) {
            return $ip;
        }

        if (str_starts_with($packed, str_repeat("\0", 10)."\xff\xff")) {
            return (string) inet_ntop(substr($packed, 12));
        }

        return inet_ntop(substr($packed, 0, 8).str_repeat("\0", 8)).'/64';
    }

    /** HMAC de la red del cliente con lo que se agregue (el restaurante, la entrega). */
    public static function of(Request $request, string|int ...$parts): string
    {
        return hash_hmac('sha256', implode('|', [self::network($request), ...$parts]), config()->string('app.key'));
    }
}
