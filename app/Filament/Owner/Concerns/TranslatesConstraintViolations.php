<?php

namespace App\Filament\Owner\Concerns;

use Closure;
use Filament\Notifications\Notification;
use Filament\Support\Exceptions\Halt;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Las restricciones de la base (CHECK, EXCLUDE de los horarios, únicos, FK)
 * son la última palabra. Si un dato pasa la validación del formulario y la
 * base igual lo rechaza, el dueño ve un aviso, no un error 500: en el campo
 * que corresponde a la restricción o, si no es de ningún campo, como aviso
 * general. Borrar algo de lo que dependen otros datos (una sección con
 * platos) tampoco lanza: devuelve false y la acción avisa.
 */
trait TranslatesConstraintViolations
{
    /** SQLSTATE de PostgreSQL: único, CHECK, EXCLUDE y FK. */
    private const CONSTRAINT_VIOLATIONS = ['23505', '23514', '23P01', '23503'];

    /**
     * @template TResult
     *
     * @param  Closure(): TResult  $write
     * @return TResult
     */
    protected function writeRespectingConstraints(Closure $write): mixed
    {
        try {
            // En su propia transacción (un savepoint si ya hay una): una
            // escritura rechazada no deja abortada la de afuera.
            return DB::transaction($write);
        } catch (QueryException $exception) {
            if (! self::isConstraintViolation($exception)) {
                throw $exception;
            }

            $field = $this->constraintErrorField(self::violatedConstraint($exception));

            if ($field === null) {
                Notification::make()->danger()->title(__('panel.errors.constraint'))->send();

                throw new Halt;
            }

            throw ValidationException::withMessages([$field => __('panel.errors.constraint')]);
        }
    }

    /**
     * Borra el registro si la base lo deja; si otra fila depende de él (FK),
     * no borra nada y devuelve false.
     */
    protected function deleteRespectingConstraints(Model $record): bool
    {
        try {
            return DB::transaction(fn (): bool => (bool) $record->delete());
        } catch (QueryException $exception) {
            if (! self::isConstraintViolation($exception)) {
                throw $exception;
            }

            return false;
        }
    }

    /**
     * El campo del formulario donde se muestra el aviso, según la restricción
     * que falló (su nombre en la base, si PostgreSQL lo dio); null, aviso
     * general.
     */
    abstract protected function constraintErrorField(?string $constraint): ?string;

    private static function isConstraintViolation(QueryException $exception): bool
    {
        return in_array((string) $exception->getCode(), self::CONSTRAINT_VIOLATIONS, true);
    }

    /** PostgreSQL la nombra en el mensaje: «violates check constraint "…"». */
    private static function violatedConstraint(QueryException $exception): ?string
    {
        return preg_match('/constraint "([^"]+)"/', $exception->getMessage(), $matches) === 1 ? $matches[1] : null;
    }
}
