<?php

namespace App\Enums;

/** Estado de una solicitud de propiedad de una ficha. */
enum ClaimStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
}
