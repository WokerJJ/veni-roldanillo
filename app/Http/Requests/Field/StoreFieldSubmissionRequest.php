<?php

namespace App\Http\Requests\Field;

use App\Enums\ClaimantRole;
use App\Enums\PaymentMethod;
use App\Models\CatalogVariant;
use App\Models\FieldSubmission;
use App\Rules\PlainText;
use App\Support\ColombianMobile;
use App\Support\Field\FieldMenu;
use App\Support\Field\WeeklyHours;
use Closure;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * El cuerpo de `PUT /campo/api/submissions/{uuid}` (ADR 0048): la ficha base
 * que se levantó en el local. Valida todo con reglas del servidor (el
 * teléfono no es de fiar), normaliza los celulares a `57` + diez dígitos y
 * arma solo los campos conocidos: lo que sobre en el JSON se ignora.
 *
 * El punto es la ubicación del negocio y debe caer cerca de Roldanillo: frena
 * un GPS sin fijar o un punto en otro país.
 */
class StoreFieldSubmissionRequest extends FormRequest
{
    public const float LAT_MIN = 4.30;

    public const float LAT_MAX = 4.50;

    public const float LNG_MIN = -76.25;

    public const float LNG_MAX = -76.05;

    public function authorize(): bool
    {
        return $this->user()?->can('create', FieldSubmission::class) === true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'whatsapp' => $this->normalizedMobile($this->input('whatsapp')),
            'owner_phone' => $this->normalizedMobile($this->input('owner_phone')),
            'phone' => $this->normalizedLandline($this->input('phone')),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:120', new PlainText],
            'category_ids' => ['required', 'array', 'min:1', 'max:5'],
            'category_ids.*' => ['integer', 'distinct', Rule::exists('categories', 'id')],
            'address' => ['required', 'string', 'min:3', 'max:160', new PlainText],
            'reference' => ['nullable', 'string', 'max:160', new PlainText],
            'phone' => ['nullable', 'string', 'regex:/^[0-9]{7,12}$/'],
            'whatsapp' => ['nullable', 'string', 'regex:/^573[0-9]{9}$/'],
            'delivery' => ['required', 'boolean'],
            'payment_methods' => ['present', 'array', 'max:'.count(PaymentMethod::cases())],
            'payment_methods.*' => ['string', 'distinct', Rule::enum(PaymentMethod::class)],
            'hours' => ['present', 'array', 'max:'.WeeklyHours::MAX_SLOTS],
            'hours.*.weekday' => ['required', 'integer', 'between:0,6'],
            'hours.*.opens' => ['required', 'string', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'hours.*.closes' => ['required', 'string', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'latitude' => ['required', 'numeric', 'between:'.self::LAT_MIN.','.self::LAT_MAX],
            'longitude' => ['required', 'numeric', 'between:'.self::LNG_MIN.','.self::LNG_MAX],
            'location_source' => ['required', Rule::in(['device', 'map'])],
            'owner_name' => ['required', 'string', 'min:2', 'max:100', new PlainText],
            'owner_role' => ['required', Rule::enum(ClaimantRole::class)],
            'owner_phone' => ['required', 'string', 'regex:/^573[0-9]{9}$/'],
            'menu' => ['nullable', 'array', 'max:'.FieldMenu::MAX_SECTIONS],
            'menu.*.name_es' => ['required', 'string', 'min:1', 'max:80', new PlainText],
            'menu.*.name_en' => ['nullable', 'string', 'max:80', new PlainText],
            'menu.*.dishes' => ['required', 'array', 'min:1', 'max:'.FieldMenu::MAX_DISHES_PER_SECTION],
            'menu.*.dishes.*.name_es' => ['required', 'string', 'min:1', 'max:120', new PlainText],
            'menu.*.dishes.*.name_en' => ['nullable', 'string', 'max:120', new PlainText],
            'menu.*.dishes.*.price' => ['required', 'integer', 'between:0,'.FieldMenu::MAX_PRICE],
            'menu.*.dishes.*.is_alcohol' => ['nullable', 'boolean'],
            'menu.*.dishes.*.catalog_variant_id' => ['nullable', 'integer', 'min:1'],
            'captured_at' => ['required', 'date'],
            'restaurant_id' => ['nullable', 'integer', 'min:1'],
            'distinct_from' => ['nullable', 'array', 'max:10'],
            'distinct_from.*' => ['integer', 'min:1'],
        ];
    }

    /**
     * @return array<int, Closure(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $hours = [];

                foreach (self::listOf($this->input('hours')) as $slot) {
                    $slot = self::listOf($slot);
                    $hours[] = ['weekday' => self::whole($slot['weekday'] ?? null), 'opens' => self::text($slot['opens'] ?? null), 'closes' => self::text($slot['closes'] ?? null)];
                }

                if (! WeeklyHours::isValid($hours)) {
                    $validator->errors()->add('hours', __('field.validation.hours'));
                }

                $menu = $this->menuFrom($this->input('menu'));
                $problem = FieldMenu::problem($menu);

                if ($problem !== null) {
                    $validator->errors()->add('menu', __("field.validation.menu_{$problem}"));

                    // Una carta que ya no se acepta no merece ni una consulta al catálogo.
                    return;
                }

                $this->assertCatalogVariants($validator, $menu);
            },
        ];
    }

    /**
     * Las presentaciones del catálogo que trae la carta existen y están activas,
     * igual que su producto y su grupo: una sola consulta para todos los platos.
     *
     * @param  list<array{dishes: list<array{catalog_variant_id: int|null}>}>  $menu
     */
    private function assertCatalogVariants(Validator $validator, array $menu): void
    {
        $ids = [];

        foreach ($menu as $section) {
            foreach ($section['dishes'] as $dish) {
                if ($dish['catalog_variant_id'] !== null) {
                    $ids[] = $dish['catalog_variant_id'];
                }
            }
        }

        if ($ids === []) {
            return;
        }

        $valid = CatalogVariant::query()
            ->whereIn('id', array_values(array_unique($ids)))
            ->where('active', true)
            ->whereHas('item', fn (Builder $item) => $item->where('active', true)->whereHas('group', fn (Builder $group) => $group->where('active', true)))
            ->pluck('id')
            ->flip()
            ->all();

        foreach ($menu as $sectionIndex => $section) {
            foreach ($section['dishes'] as $dishIndex => $dish) {
                if ($dish['catalog_variant_id'] !== null && ! isset($valid[$dish['catalog_variant_id']])) {
                    $key = "menu.{$sectionIndex}.dishes.{$dishIndex}.catalog_variant_id";
                    $validator->errors()->add($key, __('field.validation.catalog_variant'));
                }
            }
        }
    }

    /**
     * Lo que recibe ReceiveFieldSubmission.
     *
     * @return array{payload: array{name: string, category_ids: list<int>, address: string, reference: string|null, phone: string|null, whatsapp: string|null, delivery: bool, payment_methods: list<string>, hours: list<array{weekday: int, opens: string, closes: string}>, menu?: list<array{name_es: string, name_en: string|null, dishes: list<array{name_es: string, name_en: string|null, price: int, is_alcohol: bool, catalog_variant_id: int|null}>}>}, latitude: float, longitude: float, location_source: string, owner_name: string, owner_role: string, owner_phone: string, captured_at: Carbon, restaurant_id: int|null, distinct_from: list<int>}
     */
    public function submission(): array
    {
        $data = $this->validated();

        $hours = [];

        foreach (self::listOf($data['hours'] ?? null) as $slot) {
            $slot = self::listOf($slot);
            $hours[] = ['weekday' => self::whole($slot['weekday'] ?? null), 'opens' => self::text($slot['opens'] ?? null), 'closes' => self::text($slot['closes'] ?? null)];
        }

        usort($hours, fn (array $a, array $b): int => [$a['weekday'], $a['opens']] <=> [$b['weekday'], $b['opens']]);

        $categoryIds = array_map(self::whole(...), self::listOf($data['category_ids'] ?? null));
        sort($categoryIds);

        $methods = array_map(self::text(...), self::listOf($data['payment_methods'] ?? null));
        sort($methods);

        $capturedAt = Carbon::parse(self::text($data['captured_at'] ?? null));

        return [
            'payload' => [
                'name' => trim(self::text($data['name'] ?? null)),
                'category_ids' => $categoryIds,
                'address' => trim(self::text($data['address'] ?? null)),
                'reference' => $this->blankToNull($data['reference'] ?? null),
                'phone' => $this->blankToNull($data['phone'] ?? null),
                'whatsapp' => $this->blankToNull($data['whatsapp'] ?? null),
                'delivery' => (bool) ($data['delivery'] ?? false),
                'payment_methods' => $methods,
                'hours' => $hours,
                'menu' => $this->menuFrom($data['menu'] ?? null),
            ],
            'latitude' => self::decimal($data['latitude'] ?? null),
            'longitude' => self::decimal($data['longitude'] ?? null),
            'location_source' => self::text($data['location_source'] ?? null),
            'owner_name' => trim(self::text($data['owner_name'] ?? null)),
            'owner_role' => self::text($data['owner_role'] ?? null),
            'owner_phone' => self::text($data['owner_phone'] ?? null),
            // La hora del teléfono es solo informativa: nunca en el futuro.
            'captured_at' => $capturedAt->isFuture() ? Carbon::now() : $capturedAt,
            'restaurant_id' => isset($data['restaurant_id']) ? self::whole($data['restaurant_id']) : null,
            'distinct_from' => array_values(array_unique(array_map(self::whole(...), self::listOf($data['distinct_from'] ?? null)))),
        ];
    }

    /**
     * La carta como la guarda la captura: nombres recortados, el inglés vacío como null y el precio entero.
     *
     * @return list<array{name_es: string, name_en: string|null, dishes: list<array{name_es: string, name_en: string|null, price: int, is_alcohol: bool, catalog_variant_id: int|null}>}>
     */
    private function menuFrom(mixed $raw): array
    {
        $menu = [];

        foreach (self::listOf($raw) as $section) {
            $section = self::listOf($section);
            $dishes = [];

            foreach (self::listOf($section['dishes'] ?? null) as $dish) {
                $dish = self::listOf($dish);
                $dishes[] = [
                    'name_es' => trim(self::text($dish['name_es'] ?? null)),
                    'name_en' => $this->blankToNull($dish['name_en'] ?? null),
                    'price' => self::whole($dish['price'] ?? null),
                    'is_alcohol' => (bool) ($dish['is_alcohol'] ?? false),
                    'catalog_variant_id' => isset($dish['catalog_variant_id']) ? self::whole($dish['catalog_variant_id']) : null,
                ];
            }

            $menu[] = [
                'name_es' => trim(self::text($section['name_es'] ?? null)),
                'name_en' => $this->blankToNull($section['name_en'] ?? null),
                'dishes' => $dishes,
            ];
        }

        return $menu;
    }

    /** @return array<mixed> */
    private static function listOf(mixed $value): array
    {
        return is_array($value) ? $value : [];
    }

    private static function text(mixed $value): string
    {
        return is_string($value) || is_int($value) || is_float($value) ? (string) $value : '';
    }

    private static function whole(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }

    private static function decimal(mixed $value): float
    {
        return is_numeric($value) ? (float) $value : 0.0;
    }

    private function blankToNull(mixed $value): ?string
    {
        $text = is_string($value) ? trim($value) : '';

        return $text === '' ? null : $text;
    }

    private function normalizedMobile(mixed $value): mixed
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return ColombianMobile::normalize($value) ?? $value;
    }

    private function normalizedLandline(mixed $value): mixed
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return preg_replace('/[\s+\-.()]/u', '', $value);
    }
}
