<?php

use App\Enums\FieldSubmissionStatus;
use App\Models\FieldSubmission;
use App\Models\Restaurant;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;

/*
| Retención de las capturas del modo Campo (ADR 0048): las devueltas y las
| rechazadas se borran a los seis meses de resueltas, con model:prune, que
| corre el scheduler a diario. Las aprobadas se conservan.
*/

uses(RefreshDatabase::class);

test('model:prune borra la captura rechazada de hace siete meses y deja la aprobada y la reciente', function () {
    $old = now()->subMonths(7);

    $rejected = FieldSubmission::factory()->create(['status' => FieldSubmissionStatus::Rejected, 'review_note' => 'no', 'reviewed_at' => $old]);
    $returned = FieldSubmission::factory()->create(['status' => FieldSubmissionStatus::Returned, 'review_note' => 'no', 'reviewed_at' => $old]);
    $recent = FieldSubmission::factory()->create(['status' => FieldSubmissionStatus::Rejected, 'review_note' => 'no', 'reviewed_at' => now()->subMonth()]);
    $approved = FieldSubmission::factory()->confirmed()->create(['status' => FieldSubmissionStatus::Approved, 'reviewed_at' => $old, 'restaurant_id' => Restaurant::factory()]);

    $this->artisan('model:prune', ['--model' => [FieldSubmission::class]])->assertSuccessful();

    expect(FieldSubmission::query()->pluck('id')->all())->toEqualCanonicalizing([$recent->id, $approved->id])
        ->and(FieldSubmission::query()->find($rejected->id))->toBeNull()
        ->and(FieldSubmission::query()->find($returned->id))->toBeNull();
});

test('el scheduler incluye FieldSubmission en model:prune todos los días', function () {
    $events = collect(app(Schedule::class)->events())
        ->filter(fn (Event $event): bool => str_contains((string) $event->command, 'model:prune') && str_contains((string) $event->command, 'FieldSubmission'));

    expect($events)->toHaveCount(1)
        ->and($events->first()?->expression)->toBe('0 0 * * *');
});
