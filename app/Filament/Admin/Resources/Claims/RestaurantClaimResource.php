<?php

namespace App\Filament\Admin\Resources\Claims;

use App\Actions\Restaurants\ApproveRestaurantClaim;
use App\Enums\ClaimantRole;
use App\Enums\ClaimStatus;
use App\Filament\Admin\AdminResource;
use App\Filament\Admin\Resources\Claims\Pages\ListRestaurantClaims;
use App\Filament\Admin\Resources\Concerns\ListsRestaurantRequests;
use App\Models\RestaurantClaim;
use App\Models\User;
use Filament\Actions\Action;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;

/**
 * Reclamos «¿Es tu negocio?» (#20, ADR 0026 y 0027). Administración verifica
 * a mano (escribe o llama al celular) y aprueba: ApproveRestaurantClaim crea
 * o vincula la cuenta, la hace dueña y reclama la ficha en una transacción.
 * La contraseña temporal de una cuenta nueva se muestra una sola vez, en el
 * aviso que sigue a la aprobación; no se manda por correo (no hay correo
 * saliente) ni se puede volver a ver.
 */
class RestaurantClaimResource extends AdminResource
{
    use ListsRestaurantRequests;

    protected static ?string $model = RestaurantClaim::class;

    protected static string|\BackedEnum|null $navigationIcon = Heroicon::OutlinedKey;

    protected static ?int $navigationSort = 3;

    protected static ?string $slug = 'claims';

    public static function getModelLabel(): string
    {
        return __('panel.admin.claims.label');
    }

    public static function getPluralModelLabel(): string
    {
        return __('panel.admin.claims.plural');
    }

    public static function canCreate(): bool
    {
        return false;
    }

    /** @return Builder<RestaurantClaim> */
    public static function getEloquentQuery(): Builder
    {
        /** @var Builder<RestaurantClaim> $query */
        $query = parent::getEloquentQuery();

        return $query->with('restaurant:id,name,slug,status');
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at')
            ->columns([
                ...self::contactColumns(),
                TextColumn::make('claimant_role')
                    ->label(__('panel.admin.claims.role'))
                    ->formatStateUsing(fn (?ClaimantRole $state): string => $state === null ? '—' : (string) __("panel.admin.claims.role_{$state->value}")),
                TextColumn::make('message')->label(__('panel.admin.claims.message'))->placeholder('—')->wrap()->limit(300),
                ...self::reviewColumns(),
            ])
            ->filters([self::statusFilter()])
            ->recordActions([
                Action::make('approve')
                    ->label(__('panel.admin.requests.approve'))
                    ->icon(Heroicon::OutlinedCheck)
                    ->color('success')
                    ->visible(fn (RestaurantClaim $record): bool => $record->status === ClaimStatus::Pending)
                    ->authorize(fn (RestaurantClaim $record): bool => Gate::allows('update', $record))
                    ->modalDescription(__('panel.admin.claims.approve_help'))
                    ->fillForm(fn (RestaurantClaim $record): array => ['email' => $record->contact_email])
                    ->schema([
                        TextInput::make('email')
                            ->label(__('panel.admin.claims.email'))
                            ->helperText(__('panel.admin.claims.email_help'))
                            ->email()
                            ->maxLength(254)
                            ->required(),
                    ])
                    ->action(fn (RestaurantClaim $record, array $data) => self::runAction(
                        fn (User $admin) => self::approve($record, $admin, is_string($data['email'] ?? null) ? $data['email'] : ''),
                        __('panel.admin.claims.approved'),
                    )),
                self::rejectAction(),
            ]);
    }

    private static function approve(RestaurantClaim $claim, User $admin, string $email): void
    {
        $result = app(ApproveRestaurantClaim::class)->handle($claim, $admin, $email);

        if ($result->temporaryPassword === null) {
            Notification::make()->info()->title(__('panel.admin.claims.linked', ['email' => $result->owner->email]))->persistent()->send();

            return;
        }

        // Una sola vez: no queda en la base (solo su hash) ni se vuelve a mostrar.
        Notification::make()
            ->warning()
            ->title(__('panel.admin.claims.password_title', ['email' => $result->owner->email]))
            ->body(__('panel.admin.claims.password_body', ['password' => $result->temporaryPassword]))
            ->persistent()
            ->send();
    }

    public static function getPages(): array
    {
        return [
            'index' => ListRestaurantClaims::route('/'),
        ];
    }
}
