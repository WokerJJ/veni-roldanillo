<?php

namespace App\Filament\Admin\Auth;

use App\Filament\Owner\Auth\Login as OwnerLogin;

/**
 * Login del panel de administración (#19, ADR 0027): el mismo del panel del
 * dueño (cinco intentos por minuto por IP y diez fallidos por cuenta en
 * quince minutos), con su propia cuenta de intentos.
 */
class Login extends OwnerLogin
{
    protected const string RATE_LIMIT_PREFIX = 'admin-panel-login';
}
