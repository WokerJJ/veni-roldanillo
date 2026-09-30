# ADR 0004 · Pedidos por WhatsApp sin comisión

**Estado:** aceptada

**Contexto:** los restaurantes de Roldanillo ya venden por WhatsApp y rechazan las comisiones de las plataformas nacionales. Muchos pedidos se pierden por la conversación de ida y vuelta.

**Decisión:** el carrito arma un mensaje estructurado (plato, adiciones, total estimado, barrio, dirección con referencia, pago y cambio) y abre `wa.me` del restaurante. Sin pagos en la plataforma. Se registra solo la intención de pedido, sin direcciones ni contenido.

**Consecuencias:** adopción sin fricción para los negocios y cero riesgo financiero. No hay confirmación automática del pedido, por eso la verificación de reseñas usa señales adicionales (ver ADR 0005).
