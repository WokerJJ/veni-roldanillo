<?php

namespace App\Filament\Owner\Support;

use App\Enums\MediaKind;
use App\Filament\Owner\Contracts\ReceivesMediaUploads;
use App\Support\Media\ImageInspector;
use App\Support\Media\MediaStore;
use Closure;
use Filament\Forms\Components\Checkbox;
use Filament\Forms\Components\FileUpload;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Get;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Livewire\Component;
use Livewire\Features\SupportFileUploads\TemporaryUploadedFile;

/**
 * La imagen de un plato o de una promoción en el panel del dueño (#113, ADR
 * 0034): una sección con el campo de subida y la declaración de derechos.
 *
 * - En el navegador: solo JPEG, PNG o WebP de hasta config('media.max_kilobytes'),
 *   recortada a la proporción del tipo, con el editor para elegir el encuadre.
 * - En el servidor, al guardar: el contenido se revisa de nuevo
 *   (ImageInspector) y el original queda en el disco privado; la página
 *   (HandlesMediaUpload) manda a la cola el que ella misma guardó y nada más.
 *   Una ruta que llegue escrita desde el navegador no cuenta.
 * - La casilla «tengo los derechos» aparece solo cuando hay una imagen nueva,
 *   y sin marcarla no se guarda.
 *
 * El estado del campo es la clave de la imagen ya procesada (la vista previa
 * muestra su tamaño de tarjeta), una imagen recién subida o nada. Lo que
 * mostraba al abrir la página lo anota la página (rememberShownMedia).
 */
final class MediaUpload
{
    public const string FIELD = 'image';

    public const string RIGHTS_FIELD = 'image_rights';

    public static function section(MediaKind $kind): Section
    {
        return Section::make(__("panel.media.{$kind->value}.section"))
            ->description(__("panel.media.{$kind->value}.help", ['ratio' => $kind->ratioLabel(), 'mb' => intdiv(config()->integer('media.max_kilobytes'), 1024)]))
            ->columnSpanFull()
            ->schema([
                self::field($kind),
                Checkbox::make(self::RIGHTS_FIELD)
                    ->label(__('panel.media.rights'))
                    ->helperText(__('panel.media.rights_help'))
                    ->accepted()
                    ->validationMessages(['accepted' => __('panel.media.errors.rights')])
                    ->dehydrated(false)
                    ->visible(fn (Get $get): bool => self::hasNewUpload($get(self::FIELD))),
            ]);
    }

    public static function field(MediaKind $kind): FileUpload
    {
        return FileUpload::make(self::FIELD)
            ->hiddenLabel()
            ->image()
            ->acceptedFileTypes(array_keys(ImageInspector::TYPES))
            ->maxSize(config()->integer('media.max_kilobytes'))
            // El navegador recorta a la proporción antes de enviar (y el dueño
            // ajusta el encuadre con el editor); el servidor exige que llegue así.
            ->imageAspectRatio($kind->ratioLabel())
            ->automaticallyCropImagesToAspectRatio()
            ->imageEditor()
            ->imageEditorAspectRatioOptions([$kind->ratioLabel()])
            ->panelAspectRatio($kind === MediaKind::Dish ? '1:1' : '16:9')
            ->imagePreviewHeight('240')
            ->live()
            // La clave no es un archivo del disco: no se revisa si existe.
            ->fetchFileInformation(false)
            ->afterStateHydrated(function (FileUpload $component, ?Model $record, Component $livewire) use ($kind): void {
                $key = $record?->getAttribute($kind->column());
                $key = is_string($key) && MediaStore::isKey($key, $kind) ? $key : null;
                $component->rawState($key !== null ? [(string) Str::uuid() => $key] : []);

                // Lo que se ve al abrir: guardar con el campo vacío solo
                // quita una imagen si había una (HandlesMediaUpload).
                if ($livewire instanceof ReceivesMediaUploads) {
                    $livewire->rememberShownMedia($key);
                }
            })
            // Una foto subida que la cola todavía no publicó: la columna sigue
            // con la anterior (o vacía) unos segundos.
            ->helperText(function (?Model $record) use ($kind): ?string {
                $id = $record?->getKey();

                if (! is_int($id) || ! MediaStore::isProcessing($kind, $id)) {
                    return null;
                }

                $text = __('panel.media.processing_field');

                return is_string($text) ? $text : null;
            })
            ->getUploadedFileUsing(fn (string $file): ?array => MediaStore::isKey($file, $kind) ? [
                'name' => basename($file).'.webp',
                'size' => 0,
                'type' => 'image/webp',
                'url' => MediaStore::url($file, $kind->defaultWidth()),
            ] : null)
            // Quitarla en el campo no borra nada hasta guardar (HandlesMediaUpload).
            ->deleteUploadedFileUsing(fn (): null => null)
            ->rule(fn (): Closure => function (string $attribute, mixed $value, Closure $fail) use ($kind): void {
                if ($value instanceof TemporaryUploadedFile) {
                    $inspection = ImageInspector::inspect((string) $value->getRealPath(), $kind);

                    if (! $inspection['ok']) {
                        $fail(__($inspection['error'], ['mb' => intdiv(config()->integer('media.max_kilobytes'), 1024), 'min' => $kind->minShortSide()]));
                    }
                }
            })
            ->saveUploadedFileUsing(function (TemporaryUploadedFile $file, Component $livewire) use ($kind): ?string {
                $inspection = ImageInspector::inspect((string) $file->getRealPath(), $kind);

                if (! $inspection['ok'] || ! $livewire instanceof ReceivesMediaUploads) {
                    return null;
                }

                $path = MediaStore::keepPending($file, $inspection['mime']);
                $livewire->rememberMediaUpload($path);

                return $path;
            });
    }

    public static function hasNewUpload(mixed $state): bool
    {
        foreach (is_array($state) ? $state : [$state] as $file) {
            if ($file instanceof TemporaryUploadedFile) {
                return true;
            }
        }

        return false;
    }
}
