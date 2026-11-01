<?php

namespace App\Console\Commands;

use App\Support\Media\MediaStore;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Borra de PostgreSQL las sesiones inactivas y la caché vencida (#23). La
 * política de datos dice que la sesión (con la IP y el navegador) se borra
 * tras unas dos horas de inactividad y que los límites de intentos guardan la
 * IP y la huella del celular solo por un rato; Laravel borra esas filas por
 * sorteo (una de cada cien peticiones a la sesión) o nunca (la caché vencida
 * se queda hasta que alguien pida la misma clave). El scheduler lo corre cada
 * hora (routes/console.php).
 *
 * Borra por las tablas de config/session.php y config/cache.php aunque el
 * driver de este proceso sea otro: son las que llena la app en producción.
 */
#[Signature('veni:prune-expired')]
#[Description('Borra las sesiones inactivas y las filas vencidas de la caché en la base')]
class PruneExpired extends Command
{
    public function handle(): int
    {
        $now = now()->getTimestamp();
        $sessionsBefore = $now - config()->integer('session.lifetime') * 60;
        $lockTable = config('cache.stores.database.lock_table');

        $sessions = DB::table(config()->string('session.table'))
            ->where('last_activity', '<=', $sessionsBefore)
            ->delete();
        $cache = DB::table(config()->string('cache.stores.database.table'))
            ->where('expiration', '<=', $now)
            ->delete();
        $locks = DB::table(is_string($lockTable) ? $lockTable : 'cache_locks')
            ->where('expiration', '<=', $now)
            ->delete();

        $this->components->info("Borradas: {$sessions} sesiones, {$cache} entradas de caché y {$locks} candados vencidos.");

        // Originales de fotos que nunca llegaron a la cola (#113, ADR 0034):
        // se guardan al validar el formulario, y si el guardado falla después
        // quedan sin trabajo que los borre. Un día es más que cualquier cola.
        $pending = MediaStore::pendingDisk();
        $originals = 0;

        foreach ($pending->files(MediaStore::PENDING_DIRECTORY) as $file) {
            if ($pending->lastModified($file) <= $now - 86400) {
                $pending->delete($file);
                $originals++;
            }
        }

        $this->components->info("Borrados: {$originals} originales de fotos sin procesar.");

        return self::SUCCESS;
    }
}
