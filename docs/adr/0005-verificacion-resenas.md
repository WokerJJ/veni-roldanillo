# ADR 0005 · Reseñas verificadas con puntaje de confianza

**Estado:** aceptada

**Contexto:** el fraude más común en reseñas lo comete el propio negocio. Un clic en WhatsApp no garantiza un pedido, y el GPS se puede falsear.

**Decisión:** combinar señales en un puntaje invisible: "¿Al final sí pediste?", GPS con precisión y permanencia, sticker NTAG 424 DNA con validación criptográfica, confirmación opcional del restaurante e historial de la cuenta. Reglas visibles mínimas: una cuenta por celular, una reseña por restaurante, dueños y empleados no reseñan. Promedio bayesiano con más peso a lo reciente y verificado.

**Consecuencias:** verificación sin pasos extra para el usuario. La lógica del puntaje debe documentarse y probarse bien; en fase 2 se agregan señales nativas (GPS falso, Play Integrity).
