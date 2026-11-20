<?php

namespace App\Actions\Restaurants;

use RuntimeException;

/**
 * Una acción de administración que no se hizo porque el estado de la ficha o
 * de la solicitud no lo permite (#19, ADR 0027). Lleva un motivo estable
 * (REASON_*): la consola y el panel arman con él su propio mensaje, y no se
 * escribió nada.
 */
final class ActionRefused extends RuntimeException
{
    public const ALREADY_PUBLISHED = 'already_published';

    public const DISMISSED = 'dismissed';

    public const NOT_VERIFIED = 'not_verified';

    public const NOT_FROM_OSM = 'not_from_osm';

    public const PUBLISHED = 'published';

    public const NOT_PENDING = 'not_pending';

    public const NOT_CLAIMABLE = 'not_claimable';

    public const ADMIN_ACCOUNT = 'admin_account';

    public const INVALID_EMAIL = 'invalid_email';

    public const MISSING_NOTE = 'missing_note';

    public const ACCOUNT_EXISTS = 'account_exists';

    public const REMOVED = 'removed';

    public const CLAIMED_NEEDS_OWNER = 'claimed_needs_owner';

    public const UNCLAIMED_HAS_OWNER = 'unclaimed_has_owner';

    // Modo Campo (ADR 0048).
    public const NOT_YOURS = 'not_yours';

    public const CONTENT_CONFLICT = 'content_conflict';

    public const CONTENT_UNCHANGED = 'content_unchanged';

    public const INVALID_TARGET = 'invalid_target';

    public const NOT_OPEN = 'not_open';

    public const NOT_CONFIRMED = 'not_confirmed';

    public const CONTENT_CHANGED = 'content_changed';

    public const DUPLICATES_UNRESOLVED = 'duplicates_unresolved';

    public const CODE_INVALID = 'code_invalid';

    public function __construct(public readonly string $reason)
    {
        parent::__construct("Acción rechazada: {$reason}.");
    }
}
