<?php

namespace App\Filament\Owner\Concerns;

use App\Filament\Owner\OwnerResource;
use LogicException;

/**
 * El recurso del panel del dueño de una página (CreateOwnerRecord,
 * EditOwnerRecord), con su tipo: así la página llega a mutateFormData,
 * constraintErrorField y getUrl del recurso.
 */
trait ResolvesOwnerResource
{
    /**
     * @return class-string<OwnerResource>
     */
    private function ownerResource(): string
    {
        $resource = static::getResource();

        if (! is_subclass_of($resource, OwnerResource::class)) {
            throw new LogicException("{$resource} no es un recurso del panel del dueño.");
        }

        return $resource;
    }
}
