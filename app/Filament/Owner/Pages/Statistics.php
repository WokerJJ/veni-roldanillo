<?php

namespace App\Filament\Owner\Pages;

use App\Models\OrderIntent;
use App\Models\Restaurant;
use App\Support\OrderIntentStats;
use Filament\Facades\Filament;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Facades\Gate;
use Livewire\Attributes\Url;

/**
 * Las estadísticas del dueño (#22, ADR 0031) en /panel/{slug}/statistics:
 * los toques en «Enviar pedido por WhatsApp» de su ficha en los últimos 7 o
 * 30 días, día por día y contra el período anterior.
 *
 * El restaurante es siempre el de la dirección (el tenant, que Filament ya
 * comprobó que es de esta persona) y además lo autoriza
 * RestaurantPolicy::viewStatistics. El período que llega de la URL se
 * acota a OrderIntentStats::PERIODS: no es un parámetro libre de la consulta.
 */
class Statistics extends Page
{
    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedChartBar;

    protected static ?int $navigationSort = 90;

    protected static ?string $slug = 'statistics';

    protected string $view = 'filament.owner.pages.statistics';

    #[Url]
    public int $days = 7;

    public static function getNavigationLabel(): string
    {
        return __('panel.stats.label');
    }

    public function getTitle(): string
    {
        return __('panel.stats.heading');
    }

    public static function canAccess(): bool
    {
        $restaurant = Filament::getTenant();

        return $restaurant instanceof Restaurant && Gate::allows('viewStatistics', $restaurant);
    }

    public function setPeriod(int $days): void
    {
        $this->days = $days;
    }

    public function period(): int
    {
        return in_array($this->days, OrderIntentStats::PERIODS, true) ? $this->days : OrderIntentStats::PERIODS[0];
    }

    public function stats(): OrderIntentStats
    {
        $restaurant = Filament::getTenant();

        if (! $restaurant instanceof Restaurant || Gate::denies('viewStatistics', $restaurant)) {
            abort(403);
        }

        return OrderIntentStats::for($restaurant, $this->period());
    }

    public function retentionMonths(): int
    {
        return OrderIntent::RETENTION_MONTHS;
    }
}
