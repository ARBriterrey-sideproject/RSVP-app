# To do before the Sangeet song requests and venue QR go live

Branch: `feat/sangeet-songs-venue-join`

- [ ] **Print the venue QR from the production dashboard.** The QR encodes the address of whichever site the dashboard is open on. One printed from localhost or a preview deployment will point guests at the wrong place.
- [ ] **Check the Firebase Auth settings for project `shorelines-rsvp-app`.**
  - Enable Google as a sign-in provider.
  - Add `amrutashubham.com` and `www.amrutashubham.com` to the authorised domains.
  - Without both, `/join`'s redirect fallback fails.
- [ ] **Redeploy `submitSongRequest`** with `firebase deploy --only functions:submitSongRequest`. Until then, production keeps the old rules: any event, attendance required, no dedup and no 10-song cap.
- [ ] **Accept that phone OTP replaces an earlier session.** A guest who used chat or polls anonymously or through Google, and then signs in by phone, does not keep that earlier activity.
- [ ] **Have a native speaker check the new Hindi, Kannada and Odia strings.** All the new strings were machine-written: `today.songRequests.*`, the `join.*` namespace and `chat.signIn*`.
- [ ] **Check for stale "reply by" copy.** The RSVP deadline (15 October) has passed. Make sure no "reply by" text still shows during the live window.

Deferred until every feature is finished: automated tests, the real emergency contacts, and checks on real Android and iOS devices.
