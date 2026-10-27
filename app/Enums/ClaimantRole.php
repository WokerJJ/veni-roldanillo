<?php

namespace App\Enums;

/** Quién reclama una ficha (#20): su dueño o quien administra el local. */
enum ClaimantRole: string
{
    case Owner = 'owner';
    case Manager = 'manager';
}
