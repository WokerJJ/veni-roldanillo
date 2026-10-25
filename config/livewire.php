<?php

/*
 * Livewire (lo usa el panel del dueño en Filament, ADR 0025). Solo lo que
 * cambia respecto de la configuración del paquete, que completa el resto.
 */
return [
    // La versión sin eval de Livewire y Alpine (csp_safe) no entiende las
    // expresiones de Filament: el panel se rompe. Va la normal, y la CSP del
    // panel, y solo la del panel, permite 'unsafe-eval' (ADR 0025).
    'csp_safe' => false,
];
