<?php

namespace App\Enums;

/**
 * Medios de pago que acepta un restaurante (se pagan en el local o al
 * domiciliario: la plataforma no cobra). Los valores se repiten en el CHECK
 * restaurants_payment_methods_known.
 */
enum PaymentMethod: string
{
    case Cash = 'cash';
    case Nequi = 'nequi';
    case Daviplata = 'daviplata';
    case Card = 'card';
}
