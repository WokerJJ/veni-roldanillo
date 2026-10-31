<?php

// The public legal documents (#23, ADR 0030). Same structure and keys as
// lang/es/documents.php (a test checks it); the Spanish text is the reference
// one. :controller, :email, :holder, :address and :phone are filled in by the
// controller.
return [

    'pending' => '[pending publication]',

    'privacy' => [
        'title' => 'Personal data processing',
        'description' => 'What personal data Vení Roldanillo processes, why, where it is kept, for how long, and how to access, correct or delete it (Colombian Law 1581 of 2012).',
        'intro' => 'This policy explains what personal data we process at Vení, why, where it is kept and how you can exercise your rights under Colombian Law 1581 of 2012 and Decree 1377 of 2013 (now part of Decree 1074 of 2015). The underlying rule is simple: we ask for the minimum, and whatever can stay on your phone stays on your phone.',
        'sections' => [
            'controller' => [
                'heading' => 'Who is responsible for your data',
                'content' => [
                    'The data controller is :controller, the project behind this site in Roldanillo, Valle del Cauca, Colombia, run by :holder, with its address at :address and phone number :phone.',
                    'For any question, correction, complaint or deletion request about your data, write to :email. That is the contact channel for this policy.',
                ],
            ],
            'scope' => [
                'heading' => 'What it covers',
                'content' => [
                    'The personal data Vení processes on this site and in the installable app: that of people who visit the site, order through WhatsApp, claim a business listing or ask for its removal, and that of owner and admin accounts.',
                    'It does not cover what WhatsApp, Google Maps, Waze or the restaurants do with your data when you send it to them or open their services: each of them is responsible for its own processing.',
                ],
            ],
            'data' => [
                'heading' => 'What data we process and where it is kept',
                'content' => [
                    'Browsing the directory, the map and the menus, and searching, need no account and no data from you. These are the cases where we do process something:',
                    [
                        'Claiming a listing ("Is this your business? Claim it") or asking for its removal: your name, your mobile number, your email if you leave it, your role or relationship with the business, the message or reason you write, and the date and version of the privacy notice you accepted. It is stored in our database, never published and never sent to third parties.',
                        'Owner and admin accounts: name, email, password (stored as a hash, never in plain text), language and role. They are created by the Vení team or come from an approved claim; the site has no open sign-up.',
                        'Business data: name, address, opening hours, menu, prices and the restaurant\'s WhatsApp number, so you can contact it. The business publishes or authorizes it. Places that come from OpenStreetMap are added only with their name, type and point on the map, never with phone numbers or emails, and stay hidden until they are checked.',
                        'Technical records: when you visit the site, the server opens a session that stores your IP address, the browser you use and your last activity, so the site works and to protect it from abuse (attempt limits). It is deleted after two hours of inactivity. Attempt limits keep for a while the IP, a fingerprint (HMAC) of the mobile number on the forms and, when signing in to the panels, a fingerprint of the email: never the number or the email in plain text.',
                    ],
                    'Ordering through WhatsApp: when you tap "Send order on WhatsApp", your phone tells the server it was tapped, with only two pieces of data: the restaurant and whether the order is for delivery or pickup. It is stored with the date and time. The dishes, the total, the address, the name, the location, your IP, your account and any identifier of your phone are not stored: the record does not say who tapped.',
                    'Search: what you type in the search box is used to answer and is not stored. If a search fails, the log records only the type of error, not what you searched for.',
                    'For now there are no reviews and no accounts to rate. When they arrive (see the review policy), this policy will be updated before we ask you for any new data.',
                ],
            ],
            'device' => [
                'heading' => 'What stays on your phone',
                'content' => [
                    'Some things are stored only on your device (in the browser\'s storage) and never reach our server:',
                    [
                        'Your location: it is used to show where you are on the map and to calculate routes, on the phone. It is not sent to the server, put in the page address or stored.',
                        'The cart of an order, for one day.',
                        'Your delivery details (neighborhood, address, landmark and name), only if you tick "Remember" on the order form, for 90 days since you last used them. "Delete saved details" removes them.',
                        'The language and theme (light or dark) you chose, and the pages and files the app keeps to work offline.',
                    ],
                    'You can delete all of this whenever you want from your browser settings (clear the site data) or by uninstalling the app.',
                ],
            ],
            'whatsapp' => [
                'heading' => 'Ordering through WhatsApp',
                'content' => [
                    'When you tap "Send order on WhatsApp", your phone puts the order message together and opens it in WhatsApp, addressed to the restaurant. The message carries what you entered: dishes, estimated total, neighborhood, address, landmark, name, payment method and, only if you tap "Add my location to the message", a link with your location.',
                    'That message does not go through Vení: it travels in the WhatsApp link, goes through WhatsApp (Meta) servers and is received by the restaurant. You see it and decide whether to send it. From then on, WhatsApp and the restaurant process it, each under its own policies.',
                    'The only thing that reaches Vení is the notice that you tapped "Send": the restaurant and whether it is for delivery or pickup, with nothing from the message. With it the owner sees how many times people wrote to them from Vení each day. It is a count, not tracking: there is no way to know who it was or to link two taps by the same person.',
                ],
            ],
            'cookies' => [
                'heading' => 'Cookies and measurement',
                'content' => [
                    'We use only the cookies the site needs to work: the session cookie, the security cookie against forged form submissions (CSRF) and the one that remembers your language, for one year.',
                    'We use no tracking or advertising cookies and no third-party analytics tools, and the site loads no scripts from other companies. Fonts and icons are served from our own server.',
                ],
            ],
            'purposes' => [
                'heading' => 'What we use it for',
                'content' => [
                    [
                        'Reviewing a claim or a removal request and contacting you about it, at the mobile number or email you left.',
                        'If your claim is approved, creating your owner account with that name and email, so you can manage the listing.',
                        'Giving owners and the admin team access to the panels.',
                        'Showing the directory with the businesses\' information.',
                        'Telling each owner how many times "Send order on WhatsApp" was tapped on their listing, per day and whether it was delivery or pickup.',
                        'Keeping the site running and secure: sessions, attempt limits and error logs.',
                        'Handling questions and complaints about this policy.',
                    ],
                    'We do not sell or rent data, we do not use it for advertising and we do not build profiles of people.',
                ],
            ],
            'authorization' => [
                'heading' => 'Your authorization',
                'content' => [
                    'When a form asks for your data, it shows you a summary of this processing and a checkbox to authorize it. Without ticking it, the form is not sent. We keep the date of the authorization and the version of the notice you accepted, so we can prove it.',
                    'The data we process so the site works and stays secure (the session and technical records) needs no separate authorization, because without it we cannot provide the service you ask for when you open the page.',
                ],
            ],
            'processors' => [
                'heading' => 'Who else is involved',
                'content' => [
                    [
                        'Hosting provider: once the site is deployed, the server and the database will be with a hosting provider acting as a data processor, only under Vení\'s instructions. We will name it here when we hire it.',
                        'The map is downloaded from the site where it is published (today, GitHub Pages). Like any website, that server receives the IP address and browser of whoever requests it; it does not receive your location.',
                        'WhatsApp (Meta), Google Maps and Waze are not Vení\'s processors. They are services you choose to open from a link, and from then on their policies apply.',
                        'OpenStreetMap is a data source for the map and for some places: it receives no data from you.',
                    ],
                ],
            ],
            'transfers' => [
                'heading' => 'Transfers outside Colombia',
                'content' => [
                    'We do not send your data to other controllers, in Colombia or abroad. If the hosting provider has its servers outside Colombia, that is a transmission to a processor: we will only do it with a provider that offers adequate protection guarantees, and we will say so in this policy.',
                    'The WhatsApp message is sent by you and travels over Meta\'s infrastructure, which may be outside Colombia.',
                ],
            ],
            'retention' => [
                'heading' => 'How long we keep it',
                'content' => [
                    [
                        'Claims and removal requests: while they are being reviewed and up to six months after they are resolved. After that, rejected ones are deleted and approved ones are anonymized: the name, mobile number, email, message or reason and the review note are deleted, and only what identifies no one remains: which listing, the role or relationship with the business that was stated (for example, "owner" or "employee"), what was decided, who on the team reviewed it and when. That explains why a listing changed owner or was hidden.',
                        'Owner and admin accounts: while they are active. If you ask for yours to be deleted, we delete it except for what a law requires us to keep.',
                        'The "Send order on WhatsApp" notices: 13 months, to compare a month with the same one a year earlier; then they are deleted automatically. So a double tap is not counted twice, and no more than 20 taps a day are counted from the same connection to the same restaurant, the server keeps a fingerprint (HMAC) of the IP (for IPv6, of its network) with the restaurant, never the IP itself: the double-tap one stops counting after 10 seconds and the daily one after 24 hours, and both are deleted within the following hour.',
                        'Sessions: they are deleted after two hours of inactivity. The cleanup runs every hour, so none lasts more than three. Attempt limits are deleted when they expire, with the same cleanup.',
                        'What is stored on your phone: as described above, or until you delete it.',
                    ],
                ],
            ],
            'rights' => [
                'heading' => 'Your rights',
                'content' => [
                    'As the data subject, Law 1581 of 2012 gives you the right to:',
                    [
                        'Know, update and correct your data.',
                        'Ask for proof of the authorization you gave.',
                        'Know how we have used it.',
                        'Revoke the authorization and ask for its deletion, when there is no legal or contractual duty to keep it.',
                        'Access it free of charge.',
                        'File complaints with the Superintendence of Industry and Commerce (SIC), after making the query or claim with us.',
                    ],
                ],
            ],
            'how' => [
                'heading' => 'How to exercise them',
                'content' => [
                    'Write to :email with your name, how to contact you, what you are asking for and, if you can, the listing or form it is about. To protect your data, we may ask you to confirm it is you (for example, from the mobile number you left). Your representative or attorney can also ask, with the document that proves it.',
                    [
                        'Queries (what data we have and what we do with it): we answer within 10 business days at most. If we cannot make it, we tell you why before the deadline and answer within 5 more business days at most.',
                        'Claims (correct, update, delete or revoke, or report that we did not follow this policy): we answer within 15 business days at most from the day after we receive it. If we cannot make it, we tell you why and answer within 8 more business days at most. If the claim is missing information, we ask you for it within the following 5 days; if two months go by without you sending it, we understand you withdrew it.',
                    ],
                    'While a complaint about a claim or removal request is being resolved, the admin team writes "complaint in progress" and the date in that request\'s review note, and changes it once it is resolved.',
                ],
            ],
            'security' => [
                'heading' => 'How we protect it',
                'content' => [
                    'The site runs over HTTPS, the database is not exposed to the internet, passwords are stored as a hash, forms have attempt limits and protection against forged submissions, and only the admin team sees the requests. No system is infallible: if an incident affecting your data occurred, we would report it to the SIC and to the people affected, as the law requires.',
                ],
            ],
            'minors' => [
                'heading' => 'Children and teenagers',
                'content' => [
                    'The claim and removal forms are for people who represent a business, and owner and admin accounts are for adults. We do not knowingly ask for data from minors; if we learn we received some, we delete it.',
                ],
            ],
            'changes' => [
                'heading' => 'Validity and changes',
                'content' => [
                    'This policy applies from the date shown above, next to its version. If we change it significantly, we will say so on the site before applying the change; if a change affects what we use data we already have for, we will ask you for a new authorization.',
                    'Requests sent before this policy accepted the provisional notice of October 26, 2026 (version "2026-10-26"). That notice said the data is used only to review the request and get in touch about it, that it is not published or shared, and that it is deleted six months after the request is resolved. That is what happens: after six months the data that identifies the person is deleted; of an approved claim or removal request, only what identifies no one remains, as described in "How long". That notice did not mention creating the owner account: if your claim is from then and it is approved, we ask for your authorization before creating it.',
                    'The databases are kept for as long as Vení provides the service, with the periods for each kind of data stated above.',
                ],
            ],
        ],
    ],

    'terms' => [
        'title' => 'Terms of use',
        'description' => 'The rules for using Vení Roldanillo: a commission-free restaurant directory, with WhatsApp orders straight to the restaurant and approximate information.',
        'intro' => 'These terms are the rules for using Vení. Using the site or the app means you accept them. They are written to be understood: if something is unclear, write to us.',
        'sections' => [
            'what' => [
                'heading' => 'What Vení is',
                'content' => [
                    'Vení Roldanillo is a directory of the restaurants of Roldanillo, Valle del Cauca: menus with prices, opening hours, a map, "Today\'s lunches" and orders through WhatsApp. It is made by :controller.',
                    'Using it is free and needs no account. Accounts exist only for business owners and for the admin team.',
                ],
            ],
            'orders' => [
                'heading' => 'Orders are between you and the restaurant',
                'content' => [
                    'Vení does not sell food, charges no commissions on orders and does not receive their payments. Restaurants can hire a featured plan, which is labeled "Sponsored" and never changes their reviews. When you order through WhatsApp, the site only puts the message together and opens it in WhatsApp; the order, the final price, delivery, payment and handover are agreed directly between you and the restaurant.',
                    'Vení is not a party to that agreement. Any complaint about an order (what arrived, how it arrived, how much it cost) goes to the restaurant, which answers as the seller under the Colombian Consumer Statute (Law 1480 of 2011).',
                ],
            ],
            'information' => [
                'heading' => 'Information is approximate',
                'content' => [
                    'We do our best to keep information up to date, but it may change without notice or contain mistakes:',
                    [
                        'Prices and "Estimated total": the restaurant confirms the final amount.',
                        'Opening hours, "Open now", menus, sold-out dishes and today\'s lunches: they depend on what each business publishes.',
                        'Routes, distances and times: they are estimates, calculated on your phone with OpenStreetMap data. Always watch where you are going and follow traffic signs.',
                        'Listings not yet claimed by their owner say "Unverified information" and show the date they were last updated.',
                    ],
                    'If you see something wrong, let us or the business know.',
                ],
            ],
            'acceptable-use' => [
                'heading' => 'Acceptable use',
                'content' => [
                    'When using Vení you agree not to:',
                    [
                        'Send false claims, removal requests or other false information, or impersonate another person or business.',
                        'Use the site to harass, deceive or harm people or businesses.',
                        'Try to access accounts or parts of the system that are not yours, get around attempt limits or disrupt the site.',
                        'Copy the businesses\' content in bulk (automated downloads) for other purposes. The data that comes from OpenStreetMap can be requested under its license (see Credits).',
                    ],
                    'If these rules are broken, we may block access, reject requests or close an account.',
                ],
            ],
            'listings' => [
                'heading' => 'Listings, claims and removals',
                'content' => [
                    'Any business can claim its listing or ask for its removal from the listing itself. A person on the team reviews each request by hand and contacts whoever sent it. Saving a request changes nothing on the listing until it is approved.',
                    'Owners are responsible for what they publish on their listing (menu, prices, photos, hours, promotions) and guarantee they have the right to publish it. We may correct or hide anything false, misleading or infringing on others\' rights. Anything paid for or promoted is labeled "Sponsored".',
                ],
            ],
            'reviews' => [
                'heading' => 'Reviews',
                'content' => [
                    'Reviews are not available yet. When they arrive, they will be governed by the review policy, which can already be read.',
                ],
            ],
            'intellectual-property' => [
                'heading' => 'Intellectual property',
                'content' => [
                    [
                        'The Vení name, its logo, its design and the site\'s software belong to their author.',
                        'The map data and the data of some places come from OpenStreetMap (© OpenStreetMap contributors) and are used under the Open Database License (ODbL); the part of our database that comes from there is given to anyone who asks, under the same license.',
                        'The icons are from colombia-icons (MIT license), MapLibre GL JS draws the map (3-clause BSD license) and the fonts are used under the SIL Open Font License. The details are in Credits.',
                        'Each restaurant\'s names, logos, photos and menus belong to the restaurant, which authorizes showing them.',
                    ],
                ],
            ],
            'third-parties' => [
                'heading' => 'Links to other services',
                'content' => [
                    'Vení links to WhatsApp, Google Maps, Waze and OpenStreetMap. When you open them, you leave Vení and their own terms and policies apply. We are not responsible for how those services work.',
                ],
            ],
            'availability' => [
                'heading' => 'Availability',
                'content' => [
                    'Vení is a work in progress. We may change, pause or remove features, and the site may be unavailable at times because of maintenance, failures or poor signal. The app keeps part of it to work offline, but what is kept may be out of date.',
                ],
            ],
            'liability' => [
                'heading' => 'Liability',
                'content' => [
                    'We are responsible for what depends on us: running the site with reasonable care and processing data as the personal data policy says. We are not responsible for restaurants\' orders, products, prices or service, for information a business publishes or fails to update, or for the third-party services you open from Vení.',
                    'Nothing in these terms takes away the rights Colombian law gives you, including those of the Consumer Statute.',
                ],
            ],
            'changes' => [
                'heading' => 'Changes and governing law',
                'content' => [
                    'We may update these terms; the current version and date are shown above, and if the change is significant we will announce it on the site. Continuing to use Vení after a change means you accept the new version.',
                    'These terms are governed by the laws of Colombia. If a disagreement comes up, let\'s first try to solve it by talking: write to :email.',
                ],
            ],
        ],
    ],

    'reviews' => [
        'title' => 'Review policy',
        'description' => 'How Vení Roldanillo\'s verified reviews will work: who can review, how reviews are verified, what is moderated, what is removed and how a restaurant can reply.',
        'intro' => 'Reviews do not exist on Vení yet. This is the policy that will govern them when they arrive, published now so restaurants and visitors know the rules before they start. If something changes while we build them, this page is updated before they open.',
        'sections' => [
            'principles' => [
                'heading' => 'What we are after',
                'content' => [
                    'Useful, trustworthy reviews from people who really ordered from or visited the restaurant, without extra steps to prove it. An honest negative review is worth as much as a positive one.',
                ],
            ],
            'who' => [
                'heading' => 'Who can review',
                'content' => [
                    [
                        'People with an account verified with their mobile number: one account per mobile number.',
                        'One review per person and restaurant.',
                        'A restaurant\'s owners and employees cannot review that restaurant.',
                        'New accounts wait between 24 and 48 hours before their first review is published.',
                    ],
                ],
            ],
            'verification' => [
                'heading' => 'How reviews are verified',
                'content' => [
                    'Each review carries signs that the experience was real, combined into a trust score that is not public: for example, having ordered through WhatsApp and confirming "Yes, I ordered", having been near the place or having tapped the table sticker. Reviews with more signs weigh more in the average, and some carry a badge such as "Verified order" or "Visited the place".',
                    'To verify a visit, your location is used on the phone and only the result (yes or no) is kept on the server, never your coordinates. When this exists, the personal data policy will explain it in detail before we ask you for any data.',
                ],
            ],
            'content' => [
                'heading' => 'What can be published',
                'content' => [
                    'Tell us about your experience: the food, the service, the delivery time, the place. Respectful criticism is welcome. We do not publish reviews that:',
                    [
                        'Insult, harass or discriminate against people.',
                        'Include other people\'s personal data (employees\' full names, phone numbers, addresses) or photos of people without their permission.',
                        'Are false, from someone who did not have the experience, or are paid for, requested in exchange for something or written by competitors.',
                        'Are off topic: advertising, politics, links or subjects unrelated to the restaurant.',
                        'Infringe copyright or other laws.',
                    ],
                ],
            ],
            'moderation' => [
                'heading' => 'Moderation',
                'content' => [
                    'An automatic system sends suspicious reviews to review (bursts of reviews, several from the same device, similar texts, inconsistent locations) and a person on the team decides. Anyone can report a review.',
                    'A review is only removed or hidden if it breaks this policy. It is never removed for being negative, or because the restaurant asks or pays: a restaurant\'s paid plan never hides or deletes reviews. If we remove your review, we tell you why and you can ask for it to be reviewed again.',
                ],
            ],
            'reply' => [
                'heading' => 'The restaurant\'s right of reply',
                'content' => [
                    'Each restaurant can publicly reply to reviews from its panel, and its reply is shown below the review. Replies follow the same rules: no insults and no personal data of the reviewer.',
                    'If a restaurant believes a review breaks this policy, it can report it; it cannot delete it.',
                ],
            ],
            'private-channel' => [
                'heading' => 'Private messages',
                'content' => [
                    'If your experience was bad, you will also be offered the option of telling the restaurant privately so it can fix it. That message never replaces your public review: whether to publish it is still your decision.',
                ],
            ],
            'incentives' => [
                'heading' => 'No rewards for stars',
                'content' => [
                    'Restaurants may not offer discounts, gifts or rewards in exchange for highly rated reviews, or make anything depend on the rating. If it happens, the affected reviews are left out of the average and the restaurant may lose benefits on Vení. This also protects the truthful advertising the Consumer Statute requires.',
                ],
            ],
            'rating' => [
                'heading' => 'How the rating is calculated',
                'content' => [
                    'The average gives more weight to recent and verified reviews, and it is always shown next to the number of reviews. Sponsored content is labeled "Sponsored" and never changes the rating.',
                ],
            ],
            'changes' => [
                'heading' => 'Changes',
                'content' => [
                    'This policy is published before reviews exist and may be adjusted while we build them. Each version shows its number and date above. For questions or reports, write to :email.',
                ],
            ],
        ],
    ],

];
