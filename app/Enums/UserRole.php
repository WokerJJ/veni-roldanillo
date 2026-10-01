<?php

namespace App\Enums;

/** Rol global de la cuenta; ser dueño o empleado depende de cada restaurante. */
enum UserRole: string
{
    case User = 'user';
    case Admin = 'admin';
}
