<?php

namespace App\Filament\Owner\Pages;

use App\Filament\Owner\Concerns\ResolvesOwnerTenant;
use App\Filament\Owner\Support\PanelNavigation;
use App\Models\OrderIntent;
use App\Support\OrderIntentStats;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
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
    use ResolvesOwnerTenant;

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

    /** Solo con «Ver todo» (ADR 0035); la dirección sigue andando en el simple. */
    public static function shouldRegisterNavigation(): bool
    {
        return parent::shouldRegisterNavigation() && PanelNavigation::isFull();
    }

    protected static function tenantAbility(): string
    {
        return 'viewStatistics';
    }

    /** Llega del navegador: un valor que no es un entero da 404, no un 500. */
    public function setPeriod(mixed $days): void
    {
        abort_unless(is_int($days) || (is_string($days) && ctype_digit($days)), 404);

        $this->days = (int) $days;
    }

    public function period(): int
    {
        return in_array($this->days, OrderIntentStats::PERIODS, true) ? $this->days : OrderIntentStats::PERIODS[0];
    }

    public function stats(): OrderIntentStats
    {
        return OrderIntentStats::for($this->restaurant(), $this->period());
    }

    public function retentionMonths(): int
    {
        return OrderIntent::RETENTION_MONTHS;
    }
}
