# Avia Market Bot v2

Fresh rebuild of the VK Avia Market bot.

## Architecture
- One callback endpoint: `api/vk-callback.js`
- Immediate VK callback ACK via `waitUntil`
- No Supabase dependency in the core market flow
- VK common-chat history is the listing source of truth
- Private-chat mode is inferred from the latest bot prompt, so no external session store is required
- Automatic Git deployments are disabled; production is deployed manually only after a tested release is ready

## User surfaces
- `🌐 AVIA MARKET — UMUMIY CHAT`: common market feed
- `🤖 AVIA MARKET — SHAXSIY BOT / KABINET`: private actions, lists and stats

## Required environment variables
`VK_TOKEN`, `VK_GROUP_ID`, `VK_PRIMARY_PEER_ID`, `VK_CONFIRMATION_STRING`, and either `VK_SECRET_SHA256` or `VK_SECRET`.
Optional: `VK_CLEANUP_USER_ID`, `VK_BOT_OPEN_URL`, `VK_STRICT_MARKET_CHAT`, `VK_API_VERSION`.

## Release discipline
1. Develop/test on `rebuild/vk-avia-market-bot-v2` (no Vercel deploy).
2. Run `npm test` and `npm run check`.
3. Move the tested subtree to `vk-avia-market-bot` in one commit.
4. Create one controlled production deployment.
