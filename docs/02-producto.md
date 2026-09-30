# Producto y funcionalidades

## Residentes

- Todos los restaurantes del municipio, sin contenido de otras ciudades.
- Búsqueda por plato en todo el municipio, con precios (tolerante a errores: "amburguesa").
- Filtros: abierto ahora, domicilio, precio, tipo de comida, método de pago.
- **Almuerzos de hoy:** menú del día publicado por cada restaurante.
- **Sugiéreme algo:** recomendación aleatoria para indecisos.
- Explorar y pedir sin registro; cuenta solo para calificar.
- Favoritos guardados en el dispositivo.

## Turistas

- Idioma según el teléfono (ES/EN), cambiable.
- Guía de platos típicos del Valle y dónde probarlos.
- "Comer cerca de…" Museo Rayo, parque principal, zona de parapente.
- Mapa con la ubicación del usuario (solo en el dispositivo), ruta a pie o en vehículo hasta el restaurante y botón "Abrir en Google Maps / Waze" por enlace (ADR 0008).
- Explicación de Nequi, Daviplata, efectivo y "¿con cuánto pagás?".

## Restaurantes (panel desde el celular)

- Ficha con menú, fotos, horarios, ubicación (el dueño arrastra el pin).
- **Agotado hoy** por plato (se reactiva solo al día siguiente).
- Promociones por fechas, horarios especiales, cierre temporal.
- **Aviso de demora** ("Demora de 40 min") con un toque.
- Responder reseñas públicamente; recibir quejas privadas.
- Estadísticas: vistas de ficha y clics en "Pedir por WhatsApp".
- "¿Es tu negocio? Reclámalo" con verificación de propiedad. Retiro de ficha a solicitud.
- Fichas no reclamadas muestran "Información sin verificar" y fecha de actualización.

## Pedido por WhatsApp

1. El usuario arma el pedido: platos, opciones obligatorias (ej. proteína), adiciones con precio, ingredientes a quitar, nota libre.
2. Elige barrio (lista de Roldanillo, define costo de domicilio por zona), dirección y **referencia** ("casa azul frente a la tienda"); opcional: ubicación como enlace de mapa.
3. Método de pago; si es efectivo, "¿Con cuánto pagás?".
4. Se abre WhatsApp del restaurante con el mensaje listo:

```text
Hola, pedido desde Vení Roldanillo:
• 1 Hamburguesa sencilla + queso + tocineta, sin cebolla
• 1 Gaseosa 400 ml
Total estimado: $24.500 + domicilio
Barrio: El Carmen
Dirección: Cra 5 #8-20, casa azul frente a la tienda
Pago: efectivo, paga con $50.000
📍 Ubicación: <enlace>
```

Las direcciones se guardan solo en el dispositivo ("Casa", "Trabajo").

## Calificaciones

Principio: el usuario nunca hace un paso extra para ser verificado.

- **Flujo domicilio:** 1-2 h después del clic en WhatsApp (ajustado al tiempo promedio del restaurante): "¿Al final sí pediste?" → Sí/No. Si sí: estrellas (1 toque) → etiquetas rápidas que cambian según las estrellas → 👍/👎 por plato → comentario y foto opcionales. Máximo un recordatorio.
- **Flujo en el local:** sticker NFC/QR en la mesa o permanencia detectada cerca del local → "¿Cómo estuvo tu visita?". Etiquetas de local (atención, limpieza, ambiente).
- **Canal privado:** con 1-2 estrellas se ofrece avisar en privado al restaurante; nunca reemplaza la reseña pública.
- **Insignias:** "Pedido verificado", "Visitó el local", "Guía local".
- **Cálculo:** promedio bayesiano, mayor peso a lo reciente y a lo verificado, cantidad visible junto al promedio.
- **Ficha:** barras por aspecto derivadas de etiquetas ("Llega a tiempo 92 %"), "Lo más recomendado" por plato, filtros (verificadas, con foto, en inglés), traducción automática con "Ver original", respuesta del dueño.

### Señales de confianza (puntaje invisible)

| Señal | Efecto |
| --- | --- |
| Clic reciente en "Pedir por WhatsApp" + "Sí, pedí" | Suma |
| GPS preciso (margen < 100 m) a menos de ~50 m del local | Suma |
| Permanencia: dos lecturas cercanas con minutos de diferencia | Suma |
| Toque de sticker NTAG 424 DNA con código válido (SUN/CMAC, contador nuevo) | Suma mucho |
| Confirmación del restaurante en su resumen diario | Suma |
| Antigüedad e historial variado de la cuenta | Suma |
| Ubicación por IP fuera de la región | Resta |
| Incoherencias (coordenadas exactas del local, viajes imposibles) | Resta |
| Ráfagas de reseñas, mismo dispositivo, textos similares | Envía a moderación |

Reglas visibles: una cuenta por celular (código por WhatsApp), una reseña por restaurante, cuentas nuevas esperan 24-48 h, dueños/empleados no reseñan.

## Mockups

Existen mockups de las pantallas de calificación (domicilio interactivo, visita en local, ficha) creados en la fase de diseño. Pendiente: inicio, búsqueda, menú con carrito, mapa, Almuerzos de hoy, panel del dueño.
