<?php

namespace App\Enums;

/** Relación con el negocio de quien pide retirar su ficha (#20). */
enum RemovalRelationship: string
{
    case Owner = 'owner';
    case Manager = 'manager';
    case Employee = 'employee';
    case Other = 'other';
}
