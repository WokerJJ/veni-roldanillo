<?php

namespace App\Filament\Owner\Contracts;

/**
 * Una página del panel que guarda la imagen de su registro
 * (App\Filament\Owner\Concerns\HandlesMediaUpload).
 */
interface ReceivesMediaUploads
{
    /** Anota un original que guardó el servidor en esta misma petición. */
    public function rememberMediaUpload(string $path): void;

    /** Anota lo que muestra el campo al abrir la página (una clave o nada). */
    public function rememberShownMedia(?string $key): void;
}
