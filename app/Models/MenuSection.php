<?php

namespace App\Models;

use App\Models\Concerns\HasTranslatableFields;
use App\Models\Concerns\OwnedByRestaurant;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\MenuSectionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Normalizer;

/**
 * @property bool $counts_for_price_range
 */
#[Fillable(['name_es', 'name_en', 'position', 'counts_for_price_range'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class MenuSection extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<MenuSectionFactory> */
    use HasFactory, HasTranslatableFields, OwnedByRestaurant;

    /**
     * Las secciones que no son platos: bebidas, postres, adiciones,
     * acompañamientos y entradas (ADR 0039). Se busca al principio del nombre
     * ya pasado a minúsculas y sin tildes (normalizedName), después de lo que
     * no sea una letra (un emoji, «1.», una viñeta) y como palabra entera:
     * «Postresitos» o «Aguacates» no entran. Solo propone el valor de la
     * casilla al crear la sección; el dueño la cambia en el panel.
     */
    public const string SIDE_SECTION_PATTERN = '/^[^\p{L}]*('
        .'bebidas?|jugos?|gaseosas?|refrescos?|licor(es)?|cervezas?|cocteles?|tragos?|vinos?|aguas?|sodas?'
        .'|limonadas?|malteadas?|batidos?|cafes?|cafeteria|postres?|dulces?|helados?'
        .'|adicion(es|al|ales)?|acompan(amientos?|antes?)|extras?|porcion(es)?|entradas?|para\s+picar'
        .'|drinks?|hot\s+drinks|beverages?|juices?|cocktails?|beers?|wines?|coffees?|desserts?|sweets?'
        .'|sides?|add-?ons?|starters?|appetizers?'
        .')(?![\p{L}\p{N}])/u';

    /**
     * La casilla «Cuenta para el rango de precios» que se propone al crear
     * una sección: no cuenta si el nombre en español o en inglés empieza por
     * una de las palabras de SIDE_SECTION_PATTERN.
     */
    public static function countsForPriceRangeByName(?string $nameEs, ?string $nameEn = null): bool
    {
        foreach ([$nameEs, $nameEn] as $name) {
            if ($name !== null && preg_match(self::SIDE_SECTION_PATTERN, self::normalizedName($name)) === 1) {
                return false;
            }
        }

        return true;
    }

    /** En minúsculas y sin tildes ni virgulillas: «ACOMPAÑAMIENTOS» → «acompanamientos». */
    private static function normalizedName(string $name): string
    {
        $decomposed = Normalizer::normalize($name, Normalizer::FORM_D);

        // UTF-8 inválido: sin descomponer, para no perder el nombre entero.
        $withoutMarks = is_string($decomposed) ? preg_replace('/\p{Mn}+/u', '', $decomposed) : null;

        return mb_strtolower($withoutMarks ?? $name);
    }

    /**
     * Al crear, la casilla del rango sale del nombre si nadie la eligió
     * (el formulario del panel la manda siempre; una fábrica o un seeder,
     * no). Después la decide el dueño: cambiar el nombre no la toca.
     */
    protected static function booted(): void
    {
        static::creating(function (MenuSection $section): void {
            if (! array_key_exists('counts_for_price_range', $section->getAttributes())) {
                $section->counts_for_price_range = self::countsForPriceRangeByName($section->name_es, $section->name_en);
            }
        });
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'counts_for_price_range' => 'boolean',
        ];
    }

    /**
     * Campos con columnas _es y _en (ver HasTranslatableFields).
     *
     * @return list<string>
     */
    public function translatableFields(): array
    {
        return ['name'];
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    /**
     * Desempate por id: con la misma posición el orden sería el que
     * PostgreSQL quiera y el menú cambiaría entre cargas.
     *
     * @return HasMany<Dish, $this>
     */
    public function dishes(): HasMany
    {
        return $this->hasMany(Dish::class)->orderBy('position')->orderBy('id');
    }
}
