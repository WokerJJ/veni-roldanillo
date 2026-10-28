<?php

namespace App\Filament\Admin\Resources\Claims\Pages;

use App\Actions\Restaurants\ApprovedClaim;
use App\Filament\Admin\Resources\Claims\RestaurantClaimResource;
use Filament\Actions\Action;
use Filament\Resources\Pages\ListRecords;
use Livewire\Attributes\Locked;

/**
 * Reclamos. Después de aprobar uno, la contraseña temporal de la cuenta
 * nueva se muestra en un modal (temporaryPasswordAction), no en un aviso:
 * los avisos de Filament se guardan en la caché y la dejarían en claro en
 * la base. Vive en una propiedad de Livewire, que solo va y vuelve con la
 * página, y se borra al cerrar el modal (unmountAction).
 */
class ListRestaurantClaims extends ListRecords
{
    protected static string $resource = RestaurantClaimResource::class;

    #[Locked]
    public ?string $temporaryPassword = null;

    #[Locked]
    public ?string $temporaryPasswordEmail = null;

    /** Muestra la contraseña de la cuenta recién creada, una sola vez. */
    public function showTemporaryPassword(ApprovedClaim $approved): void
    {
        $this->temporaryPassword = $approved->temporaryPassword;
        $this->temporaryPasswordEmail = $approved->owner->email;

        $this->replaceMountedAction('temporaryPassword');
    }

    public function temporaryPasswordAction(): Action
    {
        return Action::make('temporaryPassword')
            ->modalHeading(fn (): string => (string) __('panel.admin.claims.password_title', ['email' => $this->temporaryPasswordEmail]))
            ->modalDescription(fn (): string => (string) __('panel.admin.claims.password_body', ['password' => $this->temporaryPassword]))
            ->modalSubmitAction(false)
            ->modalCancelActionLabel(__('panel.admin.claims.password_done'))
            ->closeModalByClickingAway(false);
    }

    public function unmountAction(bool|string|null $cancelParentActions = null): void
    {
        parent::unmountAction($cancelParentActions);

        $this->temporaryPassword = null;
        $this->temporaryPasswordEmail = null;
    }
}
