<?php

// Reemplaza la prueba de ejemplo del esqueleto de Laravel con una regla real.
arch('el código de la aplicación no deja funciones de depuración')
    ->expect(['dd', 'dump', 'ddd', 'ray', 'var_dump', 'print_r'])
    ->not->toBeUsed();
