# Avia Market Bot v2

VK-based B2B aviation market bot with a public market chat and a private bot/cabinet.

## Architecture
- One Vercel function only: `api/vk-callback.js`
- VK Callback API and CLICK Shop API share that one function so Hobby usage stays consolidated
- VK events are acknowledged immediately and processed with `waitUntil`
- Persistent state is stored in Supabase through the protected `avia-market-storage` Edge Function
- The Edge Function requires `x-bot-secret`; every storage RPC independently validates that secret; billing tables are in the non-exposed `private` schema
- VK common-chat messages remain the public market surface; cabinet/listing metadata is persisted for ownership, moderation and billing
- Automatic Git deployments are disabled; production is deployed manually only after a tested release is ready

## User surfaces
- `🌐 AVIA MARKET — UMUMIY CHAT`: common market feed
- `🤖 AVIA MARKET — SHAXSIY BOT / KABINET`: private actions, owned listings, contacts, balance and tariff

## Monetization
The billing foundation supports:
- UZS wallet balance per VK user
- CLICK balance top-ups with Prepare/Complete signature validation
- immutable wallet ledger/history
- 30-day `AVIA MARKET PRO` subscription purchased from wallet balance
- idempotent CLICK completion and idempotent tariff purchase
- a server-side listing gate when monetization is enabled
- a database release switch for CLICK top-ups, so callback code can be deployed/tested without exposing the payment button to users

Production starts safely with `click_topup_enabled=false`, `monetization_enabled=false`, the PRO plan price at `0`, and `is_active=false`. Existing users therefore remain on the current free flow until the CLICK callback flow and an explicit tariff price are approved.

CLICK callbacks reuse the existing function:
- Prepare: `https://project-xj41n.vercel.app/api/vk-callback?click=prepare`
- Complete: `https://project-xj41n.vercel.app/api/vk-callback?click=complete`

## Required environment variables
VK:
- `VK_TOKEN`
- `VK_GROUP_ID`
- `VK_PRIMARY_PEER_ID`
- `VK_CONFIRMATION_STRING`
- either `VK_SECRET_SHA256` or `VK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_BOT_SECRET`

CLICK:
- `CLICK_SERVICE_ID`
- `CLICK_MERCHANT_ID`
- `CLICK_SECRET_KEY` (server Secret only)
- optional `CLICK_MERCHANT_USER_ID`
- `CLICK_PAYMENT_URL` (defaults to `https://my.click.uz/services/pay`)
- `CLICK_RETURN_URL` (defaults to `https://vk.me/aviamarketbot`)
- `CLICK_ENABLED` — server-side emergency/configuration switch; callback handlers do not depend on it

Optional VK/admin values: `VK_CLEANUP_USER_ID`, `VK_BOT_OPEN_URL`, `VK_MARKET_CHAT_URL`, `VK_STRICT_MARKET_CHAT`, `VK_API_VERSION`, `VK_ADMIN_PUSH_SECRET`.

## Release discipline
1. Develop/test on a working branch with Vercel Git deployment disabled.
2. Run `npm test` and `npm run check` from `vk-avia-market-bot/`.
3. Verify Supabase migration/Edge Function state and advisors.
4. Deploy the tested callback code once with the database `click_topup_enabled=false` switch still closed.
5. Register/verify CLICK Prepare and Complete URLs for service `113792`.
6. Open wallet top-ups with a database-only change (`click_topup_enabled=true`); no second Vercel deployment is required.
7. Set a positive PRO price and enable `monetization_enabled` only after the tariff price is explicitly approved.
