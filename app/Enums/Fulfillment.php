<?php

namespace App\Enums;

/**
 * Cómo se entrega un pedido por WhatsApp: a domicilio o para recoger en el
 * local. Es lo único del pedido que llega al servidor (#22, ADR 0031). Los
 * valores se repiten en el CHECK order_intents_fulfillment_check y en
 * DeliveryMode de resources/js/order/checkout.ts.
 */
enum Fulfillment: string
{
    case Delivery = 'delivery';
    case Pickup = 'pickup';
}
