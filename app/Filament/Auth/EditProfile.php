<?php

namespace App\Filament\Auth;

use App\Models\User;
use Filament\Auth\Pages\EditProfile as FilamentEditProfile;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Components\Component;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use SensitiveParameter;

/**
 * El perfil de los dos paneles (#19, ADR 0027): el nombre y la contraseña.
 *
 * El correo no se cambia desde aquí: es la llave de la cuenta, la usa
 * administración para encontrarla y, sin correo saliente, nadie confirmaría
 * el nuevo. Se ve deshabilitado y no viaja en lo que se guarda
 * (dehydrated(false)); aunque llegara en la petición, se descarta.
 *
 * Cambiar la contraseña apaga users.must_change_password: la temporal de un
 * reclamo aprobado se cambia en el primer ingreso (RequirePasswordChange).
 */
class EditProfile extends FilamentEditProfile
{
    protected function getEmailFormComponent(): Component
    {
        return TextInput::make('email')
            ->label(__('filament-panels::auth/pages/edit-profile.form.email.label'))
            ->email()
            ->disabled()
            ->dehydrated(false)
            ->helperText(__('panel.account.email_locked'));
    }

    public function getSubheading(): ?string
    {
        $user = $this->getUser();
        $text = $user instanceof User && $user->must_change_password ? __('panel.account.must_change_password') : null;

        return is_string($text) ? $text : null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function mutateFormDataBeforeSave(#[SensitiveParameter] array $data): array
    {
        /** @var array<string, mixed> $kept */
        $kept = Arr::except(parent::mutateFormDataBeforeSave($data), ['email']);

        return $kept;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function handleRecordUpdate(Model $record, #[SensitiveParameter] array $data): Model
    {
        if (filled($data['password'] ?? null)) {
            $record->forceFill(['must_change_password' => false]);
        }

        return parent::handleRecordUpdate($record, $data);
    }
}
