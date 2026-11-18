<?php

namespace App\Policies;

use App\Models\FieldSubmission;
use App\Models\User;

/**
 * El modo Campo y su revisión son solo de administración (ADR 0048): hoy un
 * solo rol captura. Si hay más gente en la calle, este es el único lugar
 * que decide quién puede.
 */
class FieldSubmissionPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isAdmin();
    }

    public function create(User $user): bool
    {
        return $user->isAdmin();
    }

    public function view(User $user, FieldSubmission $submission): bool
    {
        return $user->isAdmin();
    }

    public function update(User $user, FieldSubmission $submission): bool
    {
        return $user->isAdmin() && $submission->captured_by === $user->id;
    }

    public function review(User $user, FieldSubmission $submission): bool
    {
        return $user->isAdmin();
    }

    public function delete(User $user, FieldSubmission $submission): bool
    {
        return false;
    }
}
