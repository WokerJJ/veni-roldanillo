<?php

/*
| Field mode texts (ADR 0048) used only by the server: the WhatsApp message
| for the owner, the confirmation page and validation notices. Kept apart
| from lang/en.json, which ships whole to the browser. The authorization
| text is PROVISIONAL (version 0.1) until a lawyer reviews it.
*/

return [
    'validation' => [
        'hours' => 'Check the opening hours: slots on the same day cannot overlap or open and close at the same time.',
    ],

    'whatsapp' => [
        'greeting' => 'Hi :owner, I am from Vení Roldanillo. I stopped by :name and prepared this listing to show it in the app.',
        'summary' => 'This is what we have:',
        'line_address' => 'Address: :value',
        'line_categories' => 'Food type: :value',
        'line_phone' => 'Phone: :value',
        'line_whatsapp' => 'WhatsApp: :value',
        'line_delivery' => 'Delivery: :value',
        'line_payments' => 'Payment methods: :value',
        'line_hours' => 'Opening hours:',
        'yes' => 'yes',
        'no' => 'no',
        'call_to_action' => 'Please review it and, if it is right, confirm it here (the link works for :days days and only once):',
    ],

    'days' => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],

    'payments' => [
        'cash' => 'cash',
        'nequi' => 'Nequi',
        'daviplata' => 'Daviplata',
        'card' => 'card',
    ],

    'confirm' => [
        'draft' => 'Draft pending legal review',
        'title' => 'Confirm your business listing',
        'intro' => 'Someone from Vení Roldanillo collected this information at your venue. Review it: it only shows up in the app if you confirm it.',
        'owner' => 'Confirmed by: :name (:role)',
        'role_owner' => 'owner',
        'role_manager' => 'business manager',
        'authorization_title' => 'Your authorization',
        'authorization' => 'I confirm that I am the person who can decide this for this business and I authorize Vení Roldanillo to publish in its app and website the business information shown above (name, food type, address, location, phone, WhatsApp, opening hours, delivery and payment methods). I can ask for it to be corrected or removed at any time.',
        'privacy' => 'Your contact details (name and mobile number) are used only to verify who authorizes this and to write to you about this listing; they are not published or shared. You can view, correct or ask for them to be deleted.',
        'privacy_link' => 'Personal data policy',
        'button' => 'I confirm',
        'sending' => 'Confirming…',
        'not_ok' => 'If something is wrong, do not confirm: tell the person who sent you the link and they will send a new one.',
        'done_title' => 'Done, thank you',
        'done' => 'We recorded your confirmation. Someone on the team reviews the listing and publishes it. If anything changes from what you saw, we will write to you again.',
        'invalid_title' => 'This link no longer works',
        'invalid' => 'The link expired, was already used or does not exist. Ask the person who sent it for a new one.',
        'changed' => 'The data changed while you were looking at it. Reload the page and review it again.',
        'hours' => 'Opening hours',
        'no_hours' => 'No opening hours added',
        'categories' => 'Food type',
        'address' => 'Address',
        'phone' => 'Phone',
        'whatsapp' => 'WhatsApp',
        'delivery' => 'Delivery',
        'payments' => 'Payment methods',
        'yes' => 'Yes',
        'no' => 'No',
    ],
];
