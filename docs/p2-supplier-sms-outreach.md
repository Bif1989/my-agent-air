# P2 supplier SMS outreach

Supplier Outreach prefers SMS when a matched external supplier has a phone number and falls back to email when no phone is available.

## Production environment

- `ESKIZ_EMAIL` — Eskiz SMS account email. Secret.
- `ESKIZ_PASSWORD` — Eskiz SMS account/API password. Secret.
- `ESKIZ_FROM` — approved Eskiz sender name/number; `4546` can be used only when allowed by the account/template configuration.

The application authenticates server-side against `https://notify.eskiz.uz/api/auth/login` and sends via `https://notify.eskiz.uz/api/message/sms/send`. Credentials never reach the browser.

## SMS body

The supplier receives a short ASCII message with the individual supplier-request link. The app tracks `sent`, then the existing token flow updates `opened` when the supplier opens the link and `responded` after a supplier response.

## Resends

A 30-second server-side cooldown protects against accidental immediate resends. Intentional resends remain possible after the cooldown, while responded invites are not reset.
