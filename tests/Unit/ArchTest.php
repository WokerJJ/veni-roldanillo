<?php

// Reemplaza la prueba de ejemplo del esqueleto de Laravel con una regla real.
arch('el código de la aplicación no deja funciones de depuración')
    ->expect(['dd', 'dump', 'ddd', 'ray', 'var_dump', 'print_r'])
    ->not->toBeUsed();

// Buenas prácticas de PHP (sin die, goto, global, echo, phpinfo, funciones
// mysql_* ni de xdebug…) en el código propio.
arch('el código sigue las buenas prácticas de PHP')->preset()->php();

// Sin funciones inseguras (eval, exec, md5, rand, unserialize…) en el código propio.
arch('el código no usa funciones inseguras')->preset()->security();
