<?php

use Laravel\Octane\Contracts\OperationTerminated;
use Laravel\Octane\Events\RequestHandled;
use Laravel\Octane\Events\RequestReceived;
use Laravel\Octane\Events\RequestTerminated;
use Laravel\Octane\Events\TaskReceived;
use Laravel\Octane\Events\TaskTerminated;
use Laravel\Octane\Events\TickReceived;
use Laravel\Octane\Events\TickTerminated;
use Laravel\Octane\Events\WorkerErrorOccurred;
use Laravel\Octane\Events\WorkerStarting;
use Laravel\Octane\Events\WorkerStopping;
use Laravel\Octane\Listeners\CloseMonologHandlers;
use Laravel\Octane\Listeners\CollectGarbage;
use Laravel\Octane\Listeners\DisconnectFromDatabases;
use Laravel\Octane\Listeners\EnsureUploadedFilesAreValid;
use Laravel\Octane\Listeners\EnsureUploadedFilesCanBeMoved;
use Laravel\Octane\Listeners\FlushOnce;
use Laravel\Octane\Listeners\FlushTemporaryContainerInstances;
use Laravel\Octane\Listeners\FlushUploadedFiles;
use Laravel\Octane\Listeners\ReportException;
use Laravel\Octane\Listeners\StopWorkerIfNecessary;
use Laravel\Octane\Octane;

return [

    /*
    |--------------------------------------------------------------------------
    | Octane Server
    |--------------------------------------------------------------------------
    |
    | This value determines the default "server" that will be used by Octane
    | when starting, restarting, or stopping your server via the CLI. You
    | are free to change this to the supported server of your choosing.
    |
    | Supported: "roadrunner", "swoole", "frankenphp"
    |
    */

    'server' => env('OCTANE_SERVER', 'roadrunner'),

    /*
    |--------------------------------------------------------------------------
    | Force HTTPS
    |--------------------------------------------------------------------------
    |
    | When this configuration value is set to "true", Octane will inform the
    | framework that all absolute links must be generated using the HTTPS
    | protocol. Otherwise your links may be generated using plain HTTP.
    |
    */

    'https' => env('OCTANE_HTTPS', false),

    /*
    |--------------------------------------------------------------------------
    | Caddy de FrankenPHP (imagen de producción)
    |--------------------------------------------------------------------------
    |
    | octane:frankenphp arranca Caddy con el Caddyfile de Octane y le pasa
    | estas variables (StartFrankenPhpCommand). CADDY_SERVER_EXTRA_DIRECTIVES
    | va dentro del bloque route, después de root y encode y antes de
    | php_server, que sirve los archivos de public/ sin pasar por Laravel; aquí
    | reemplaza a la configuración de Mercure de Octane, que no se usa.
    |
    | - public/build/assets: Vite pone el hash del contenido en cada nombre;
    |   un archivo nunca cambia, así que se guarda un año sin volver a
    |   preguntar (immutable). Solo si el archivo existe: un 404 no se guarda.
    | - public/fonts: los nombres no llevan hash (EVA-004, #5). Una semana sin
    |   preguntar; después el navegador revalida con ETag y Last-Modified y,
    |   si no cambió, recibe un 304 sin volver a bajarla. Una fuente nueva
    |   tarda como mucho una semana en llegar, y mientras tanto la anterior
    |   se ve igual de bien.
    | - nosniff también para lo que no pasa por Laravel (assets, fuentes y lo
    |   que suban los dueños a storage); `?` lo pone solo si la respuesta no
    |   lo trae ya, para no repetirlo en las de Laravel (SetSecurityHeaders).
    |
    | Lo comprueba la prueba de humo de la imagen (tests/docker/smoke-prod.sh).
    |
    */

    'caddy' => [
        'env' => [
            'CADDY_SERVER_EXTRA_DIRECTIVES' => <<<'CADDYFILE'
                @veni_build_assets {
                    path /build/assets/*
                    file
                }
                header @veni_build_assets Cache-Control "public, max-age=31536000, immutable"

                @veni_fonts {
                    path /fonts/*
                    file
                }
                header @veni_fonts Cache-Control "public, max-age=604800, must-revalidate"

                header ?X-Content-Type-Options nosniff
                CADDYFILE,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Octane Listeners
    |--------------------------------------------------------------------------
    |
    | All of the event listeners for Octane's events are defined below. These
    | listeners are responsible for resetting your application's state for
    | the next request. You may even add your own listeners to the list.
    |
    */

    'listeners' => [
        WorkerStarting::class => [
            EnsureUploadedFilesAreValid::class,
            EnsureUploadedFilesCanBeMoved::class,
        ],

        RequestReceived::class => [
            ...Octane::prepareApplicationForNextOperation(),
            ...Octane::prepareApplicationForNextRequest(),
            //
        ],

        RequestHandled::class => [
            //
        ],

        RequestTerminated::class => [
            // FlushUploadedFiles::class,
        ],

        TaskReceived::class => [
            ...Octane::prepareApplicationForNextOperation(),
            //
        ],

        TaskTerminated::class => [
            //
        ],

        TickReceived::class => [
            ...Octane::prepareApplicationForNextOperation(),
            //
        ],

        TickTerminated::class => [
            //
        ],

        OperationTerminated::class => [
            FlushOnce::class,
            FlushTemporaryContainerInstances::class,
            // DisconnectFromDatabases::class,
            // CollectGarbage::class,
        ],

        WorkerErrorOccurred::class => [
            ReportException::class,
            StopWorkerIfNecessary::class,
        ],

        WorkerStopping::class => [
            CloseMonologHandlers::class,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Warm / Flush Bindings
    |--------------------------------------------------------------------------
    |
    | The bindings listed below will either be pre-warmed when a worker boots
    | or they will be flushed before every new request. Flushing a binding
    | will force the container to resolve that binding again when asked.
    |
    */

    'warm' => [
        ...Octane::defaultServicesToWarm(),
    ],

    'flush' => [
        //
    ],

    /*
    |--------------------------------------------------------------------------
    | Octane Swoole Tables
    |--------------------------------------------------------------------------
    |
    | While using Swoole, you may define additional tables as required by the
    | application. These tables can be used to store data that needs to be
    | quickly accessed by other workers on the particular Swoole server.
    |
    */

    'tables' => [
        'example:1000' => [
            'name' => 'string:1000',
            'votes' => 'int',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Octane Swoole Cache Table
    |--------------------------------------------------------------------------
    |
    | While using Swoole, you may leverage the Octane cache, which is powered
    | by a Swoole table. You may set the maximum number of rows as well as
    | the number of bytes per row using the configuration options below.
    |
    */

    'cache' => [
        'rows' => 1000,
        'bytes' => 10000,
    ],

    /*
    |--------------------------------------------------------------------------
    | File Watching
    |--------------------------------------------------------------------------
    |
    | The following list of files and directories will be watched when using
    | the --watch option offered by Octane. If any of the directories and
    | files are changed, Octane will automatically reload your workers.
    |
    */

    'watch' => [
        'app',
        'bootstrap',
        'config/**/*.php',
        'database/**/*.php',
        'public/**/*.php',
        'resources/**/*.php',
        'routes',
        'composer.lock',
        '.env',
    ],

    /*
    |--------------------------------------------------------------------------
    | Garbage Collection Threshold
    |--------------------------------------------------------------------------
    |
    | When executing long-lived PHP scripts such as Octane, memory can build
    | up before being cleared by PHP. You can force Octane to run garbage
    | collection if your application consumes this amount of megabytes.
    |
    */

    'garbage' => 50,

    /*
    |--------------------------------------------------------------------------
    | Maximum Execution Time
    |--------------------------------------------------------------------------
    |
    | The following setting configures the maximum execution time for requests
    | being handled by Octane. You may set this value to 0 to indicate that
    | there isn't a specific time limit on Octane request execution time.
    |
    */

    'max_execution_time' => 30,

    /*
    |--------------------------------------------------------------------------
    | Octane Server State File
    |--------------------------------------------------------------------------
    |
    | This value determines where Octane stores the state file used to track
    | the running server's master process ID and admin endpoint, which is
    | read by various Octane commands. You may tweak this if necessary.
    |
    */

    'state_file' => env('OCTANE_STATE_FILE', storage_path('logs/octane-server-state.json')),

    /*
    |--------------------------------------------------------------------------
    | RoadRunner Options
    |--------------------------------------------------------------------------
    |
    | The following options are only used when the RoadRunner server is the
    | server powering your application. You may customize the path to the
    | worker binary here, which is useful for zero-downtime deployments
    | where the application is served from a symlinked "current" path.
    |
    */

    'roadrunner' => [
        'command' => env('OCTANE_ROADRUNNER_COMMAND', 'vendor/bin/roadrunner-worker'),
        'http_middleware' => env('OCTANE_ROADRUNNER_HTTP_MIDDLEWARE', 'static'),
    ],

];
