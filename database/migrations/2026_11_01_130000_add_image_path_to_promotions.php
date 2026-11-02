<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| La imagen 16:9 de cada promoción (#113, ADR 0034): la clave de sus
| versiones WebP (App\Support\Media\MediaStore), como dishes.photo_path. Sin
| imagen, null. Agregar una columna que admite null no reescribe la tabla.
*/
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->string('image_path')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn('image_path');
        });
    }
};
