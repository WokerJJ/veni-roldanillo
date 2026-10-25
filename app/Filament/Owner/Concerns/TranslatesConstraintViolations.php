<?php

namespace App\Filament\Owner\Concerns;

use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Las restricciones de la base (CHECK, EXCLUDE de los horarios, únicos) son
 * la última palabra. Si un dato pasa la validación del formulario y la base
 * igual lo rechaza, el dueño ve un aviso en el campo, no un error 500.
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
            if (! in_array((string) $exception->getCode(), self::CONSTRAINT_VIOLATIONS, true)) {
                throw $exception;
            }

            throw ValidationException::withMessages([
                $this->constraintErrorField() => __('panel.errors.constraint'),
            ]);
        }
    }

    /** El campo del formulario donde se muestra el aviso. */
    abstract protected function constraintErrorField(): string;
}
