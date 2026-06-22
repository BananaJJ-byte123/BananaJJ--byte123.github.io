# Overseas Anchor Scheduler

Feishu H5 scheduling MVP for overseas anchors.

## Entrances

- `/manager`: online supervisor/admin console, backed by Feishu Base.
- `/anchor`: online anchor self-service page, backed by Feishu Base.
- `/local-manager`: local demo supervisor/admin console, stored in browser localStorage.
- `/local-anchor`: local demo anchor page, stored in browser localStorage.

## Online Architecture

- Feishu H5 Web App: loads the Vercel pages inside Feishu.
- Vercel Serverless API: keeps Feishu app credentials off the browser.
- Feishu Base: stores anchors, brands, shift templates, declarations, schedules, and notification logs.
- Feishu Bot Webhook: sends schedule and declaration notifications to a Feishu group.

See `FEISHU_SETUP.md` for deployment variables and Base schema.
