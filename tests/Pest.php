<?php

use Tests\TestCase;

/*
| Las pruebas de Feature arrancan la aplicación de Laravel (Tests\TestCase);
| las de Unit no la necesitan y corren sobre el TestCase de PHPUnit.
*/

pest()->extend(TestCase::class)->in('Feature');
