# Seguridad y marco legal

## Seguridad

- Roles: visitante, usuario verificado, dueño, empleado, moderador, administrador (spatie/laravel-permission + Policies).
- Autorización en el servidor para todo; prevenir IDOR (un dueño no puede editar otro restaurante cambiando un ID).
- Acceso sin contraseñas: código por WhatsApp (OTP) y passkeys; 2FA obligatorio para dueños y administradores.
- Límites de tasa en login, envío de códigos, reseñas y reportes.
- Validación de toda entrada, Eloquent (sin SQL crudo con datos del usuario), escape en vistas, CSRF, `$fillable`.
- Subida de imágenes: validar tipo y tamaño, re-procesar (elimina EXIF/GPS), nombre aleatorio, WebP.
- Historial de cambios de fichas con opción de revertir (activitylog).
- Secretos solo en `.env`; `composer audit` y Dependabot.
- HTTPS obligatorio, cabeceras de seguridad, base de datos sin exposición pública.
- NFC: validar CMAC del NTAG 424 DNA en el servidor y rechazar contadores repetidos.

## Marco legal (Colombia)

- **Ley 1581 de 2012 (Habeas Data):** política de tratamiento de datos, autorización explícita al registrarse, derechos de consulta, actualización y supresión. Datos mínimos (celular, alias). Direcciones solo en el dispositivo; ubicación: solo el resultado de la verificación.
- **Ley 1480 de 2011 (Estatuto del Consumidor):** publicidad veraz; lo pagado se marca "Patrocinado".
- **Derechos de autor:** solo información pública de los negocios; fotos y logos con autorización escrita; no copiar datos ni fotos de Google, TripAdvisor u otros.
- **OpenStreetMap (ODbL):** atribución visible en el mapa.
- **Reseñas:** prohibido condicionar premios a calificaciones altas; política de reseñas pública.
- **Propiedad intelectual:** software registrado ante la DNDA; marca ante la SIC (clases 9, 35, 42). El software no es patentable en Colombia (Decisión 486 de la CAN).

## Documentos pendientes

- Política de tratamiento de datos personales.
- Términos y condiciones.
- Política de reseñas.
- Formato de autorización de uso de información e imágenes para restaurantes.
