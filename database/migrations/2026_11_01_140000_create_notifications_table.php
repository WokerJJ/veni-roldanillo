<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Las notificaciones de base de datos del panel (#113, EVA-014): la tabla
| estándar de Laravel, que leen las notificaciones de Filament. La primera
| es «no pudimos preparar tu foto» (App\Jobs\ProcessUploadedImage), para
| quienes administran el restaurante. Solo el texto del aviso: sin rutas ni
| datos de la imagen.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            // jsonb: Filament filtra por data->>'format'.
            $table->jsonb('data');
            $table->timestampTz('read_at')->nullable();
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
