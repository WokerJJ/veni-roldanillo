<?php

namespace App\Filament\Admin\Resources\Removals;

use App\Actions\Restaurants\ApproveRemovalRequest;
use App\Enums\ClaimStatus;
use App\Enums\RemovalRelationship;
use App\Filament\Admin\AdminResource;
use App\Filament\Admin\Resources\Concerns\ListsRestaurantRequests;
use App\Filament\Admin\Resources\Removals\Pages\ListRemovalRequests;
use App\Models\RestaurantRemovalRequest;
use App\Models\User;
use Filament\Actions\Action;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;

/**
 * Pedidos de retiro de una ficha (#20, ADR 0026 y 0027). Aprobar oculta la
 * ficha en la misma transacción que marca la revisión (ApproveRemovalRequest);
 * rechazar guarda el motivo y la ficha sigue igual.
 */
class RemovalRequestResource extends AdminResource
{
    use ListsRestaurantRequests;

    protected static ?string $model = RestaurantRemovalRequest::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedNoSymbol;

    protected static ?int $navigationSort = 4;

    protected static ?string $slug = 'removals';

    public static function getModelLabel(): string
    {
        return __('panel.admin.removals.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.admin.removals.plural');
    }

    public static function canCreate(): bool
    {
        return false;
    }

    /** @return Builder<RestaurantRemovalRequest> */
    public static function getEloquentQuery(): Builder
    {
        /** @var Builder<RestaurantRemovalRequest> $query */
        $query = parent::getEloquentQuery();

        return $query->with('restaurant:id,name,slug,status');
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at')
            ->columns([
                ...self::contactColumns(),
                TextColumn::make('relationship')
                    ->label(__('panel.admin.removals.relationship'))
                    ->formatStateUsing(fn (RemovalRelationship $state): string => (string) __("panel.admin.removals.relationship_{$state->value}")),
                TextColumn::make('reason')->label(__('panel.admin.removals.reason'))->placeholder('—')->wrap()->limit(300),
                ...self::reviewColumns(),
            ])
            ->filters([self::statusFilter()])
            ->recordActions([
                Action::make('approve')
                    ->label(__('panel.admin.removals.approve'))
                    ->icon(Heroicon::OutlinedEyeSlash)
                    ->color('danger')
                    ->requiresConfirmation()
                    ->modalDescription(__('panel.admin.removals.approve_help'))
                    ->modalSubmitActionLabel(__('panel.admin.removals.approve'))
                    ->visible(fn (RestaurantRemovalRequest $record): bool => $record->status === ClaimStatus::Pending)
                    ->authorize(fn (RestaurantRemovalRequest $record): bool => Gate::allows('update', $record))
                    ->action(fn (RestaurantRemovalRequest $record) => self::runAction(
                        fn (User $admin) => app(ApproveRemovalRequest::class)->handle($record, $admin),
                        __('panel.admin.removals.approved'),
                    )),
                self::rejectAction(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListRemovalRequests::route('/'),
        ];
    }
}
