<?php

namespace App\Filament\Admin\Resources\Concerns;

use App\Actions\Restaurants\RejectRestaurantRequest;
use App\Enums\ClaimStatus;
use App\Models\RestaurantClaim;
use App\Models\RestaurantRemovalRequest;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Illuminate\Support\Facades\Gate;

/**
 * Lo común de las listas de reclamos y de retiros (#20, ADR 0026 y 0027):
 * el contacto (el celular abre WhatsApp para verificar a mano), el estado,
 * el filtro que arranca en las pendientes y el rechazo con motivo.
 */
trait ListsRestaurantRequests
{
    /** @return array<string, string> */
    private static function statusOptions(): array
    {
        return collect(ClaimStatus::cases())
            ->mapWithKeys(fn (ClaimStatus $status): array => [$status->value => (string) __("panel.admin.requests.status_{$status->value}")])
            ->all();
    }

    /** @return list<TextColumn> */
    private static function contactColumns(): array
    {
        return [
            TextColumn::make('created_at')->label(__('panel.admin.requests.received'))->dateTime('Y-m-d H:i')->sortable(),
            TextColumn::make('restaurant.name')->label(__('panel.admin.restaurants.label'))->searchable(),
            TextColumn::make('contact_name')->label(__('panel.admin.requests.contact_name'))->placeholder('—'),
            TextColumn::make('contact_phone')
                ->label(__('panel.admin.requests.contact_phone'))
                ->placeholder('—')
                ->url(fn (RestaurantClaim|RestaurantRemovalRequest $record): ?string => $record->contact_phone === null ? null : "https://wa.me/{$record->contact_phone}", shouldOpenInNewTab: true),
            TextColumn::make('contact_email')->label(__('panel.admin.requests.contact_email'))->placeholder('—')->toggleable(),
        ];
    }

    /** @return list<TextColumn> */
    private static function reviewColumns(): array
    {
        return [
            TextColumn::make('status')
                ->label(__('panel.admin.requests.status'))
                ->badge()
                ->formatStateUsing(fn (ClaimStatus $state): string => self::statusOptions()[$state->value])
                ->color(fn (ClaimStatus $state): string => match ($state) {
                    ClaimStatus::Pending => 'warning',
                    ClaimStatus::Approved => 'success',
                    ClaimStatus::Rejected => 'gray',
                }),
            TextColumn::make('review_note')->label(__('panel.admin.requests.note'))->placeholder('—')->wrap()->toggleable(),
        ];
    }

    private static function statusFilter(): SelectFilter
    {
        return SelectFilter::make('status')
            ->label(__('panel.admin.requests.status'))
            ->options(self::statusOptions())
            ->default(ClaimStatus::Pending->value);
    }

    private static function rejectAction(): Action
    {
        return Action::make('reject')
            ->label(__('panel.admin.requests.reject'))
            ->icon(Heroicon::OutlinedXMark)
            ->color('danger')
            ->modalSubmitActionLabel(__('panel.admin.requests.reject'))
            ->visible(fn (RestaurantClaim|RestaurantRemovalRequest $record): bool => $record->status === ClaimStatus::Pending)
            ->authorize(fn (RestaurantClaim|RestaurantRemovalRequest $record): bool => Gate::allows('update', $record))
            ->schema([
                Textarea::make('note')
                    ->label(__('panel.admin.requests.note'))
                    ->helperText(__('panel.admin.requests.note_help'))
                    ->required()
                    ->maxLength(RejectRestaurantRequest::NOTE_MAX),
            ])
            ->action(fn (RestaurantClaim|RestaurantRemovalRequest $record, array $data) => self::runAction(
                fn ($admin) => app(RejectRestaurantRequest::class)->handle($record, $admin, is_string($data['note'] ?? null) ? $data['note'] : ''),
                __('panel.admin.requests.rejected'),
            ));
    }

    /**
     * Pendientes en el menú, para que no se acumulen sin que nadie las vea.
     */
    public static function getNavigationBadge(): ?string
    {
        $pending = static::getModel()::query()->where('status', ClaimStatus::Pending->value)->count();

        return $pending > 0 ? (string) $pending : null;
    }
}
