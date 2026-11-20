<?php

namespace App\Enums;

/**
 * Estado de una captura del modo Campo (ADR 0048). El borrador vive solo en
 * el teléfono: en el servidor la captura nace «enviada, en espera».
 */
enum FieldSubmissionStatus: string
{
    case Submitted = 'submitted';
    case OwnerConfirmed = 'owner_confirmed';
    case Approved = 'approved';
    case Returned = 'returned';
    case Rejected = 'rejected';

    /** Las que todavía esperan una decisión de alguien. */
    public function isOpen(): bool
    {
        return in_array($this, [self::Submitted, self::OwnerConfirmed], true);
    }
}
