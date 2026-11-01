<?php

namespace App\Models;

use App\Enums\MediaKind;
use App\Models\Concerns\HasMediaImage;
use App\Models\Concerns\HasTranslatableFields;
use App\Models\Concerns\OwnedByRestaurant;
use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\PromotionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Una promoción por fechas, con su imagen 16:9 (#113, ADR 0034). Larastan
 * tipa las columnas de la migración e ignora el cast; el @property fija el tipo.
 *
 * @property Carbon $starts_at
 * @property Carbon $ends_at
 */
#[Fillable(['title_es', 'title_en', 'starts_at', 'ends_at'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class Promotion extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<PromotionFactory> */
    use HasFactory, HasMediaImage, HasTranslatableFields, OwnedByRestaurant;

    /** La imagen de la promoción, 16:9 (#113): image_path guarda su clave. */
    public static function mediaKind(): MediaKind
    {
        return MediaKind::Promotion;
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    /**
     * Campos con columnas _es y _en (ver HasTranslatableFields).
     *
     * @return list<string>
     */
    public function translatableFields(): array
    {
        return ['title'];
    }

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }
}
