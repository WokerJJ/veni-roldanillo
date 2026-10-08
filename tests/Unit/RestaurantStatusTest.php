<?php

use App\Enums\RestaurantStatus;

test('se publican las fichas sin reclamar y las reclamadas, y ninguna más', function () {
    expect(RestaurantStatus::published())->toBe([RestaurantStatus::Unclaimed, RestaurantStatus::Claimed]);
});

test('un estado se publica solo si está en la lista', function (RestaurantStatus $status, bool $published) {
    expect($status->isPublished())->toBe($published);
})->with([
    'sin reclamar' => [RestaurantStatus::Unclaimed, true],
    'reclamada' => [RestaurantStatus::Claimed, true],
    'oculta' => [RestaurantStatus::Hidden, false],
]);
