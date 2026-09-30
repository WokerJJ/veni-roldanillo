<?php

namespace App\Models;

use App\Models\Contracts\BelongsToRestaurant;
use App\Policies\RestaurantContentPolicy;
use Database\Factories\PromotionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['title_es', 'title_en', 'starts_at', 'ends_at'])]
#[UsePolicy(RestaurantContentPolicy::class)]
class Promotion extends Model implements BelongsToRestaurant
{
    /** @use HasFactory<PromotionFactory> */
    use HasFactory;

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

    /** @return BelongsTo<Restaurant, $this> */
    public function restaurant(): BelongsTo
    {
        return $this->belongsTo(Restaurant::class);
    }

    public function owningRestaurant(): Restaurant
    {
        return $this->restaurant()->firstOrFail();
    }
}
