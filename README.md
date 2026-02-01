<meta name="robots" content="noindex, nofollow">
# Dream-X / PlayerXchange Mail Orchestrator

A custom Gmail orchestration app that keeps customer-facing email unified while routing conversations internally. This app treats Dream-X and PlayerXchange as separate tenants with isolated data.

## Local setup

1) Install dependencies:

```bash
npm install
```

2) Copy env vars:

```bash
cp .env.example .env
```

3) Run the dev server:

```bash
npm run dev
```

Open http://localhost:8080

- Agent login: http://localhost:8080/login
- Inbox: http://localhost:8080/inbox
- Admin portal: http://localhost:8080/admin

## Gmail OAuth setup (Workspace admin required)

1) Create a Google Cloud project and enable Gmail API + Pub/Sub.
2) Create a service account and enable Domain-Wide Delegation.
3) In Google Workspace Admin, authorize the service account with scopes:
   - https://www.googleapis.com/auth/gmail.readonly
   - https://www.googleapis.com/auth/gmail.send
   - https://www.googleapis.com/auth/gmail.modify
4) Add the service account email + private key to `.env`.
5) Ensure MAILBOX_BOARD and MAILBOX_GENERAL match your Workspace mailbox addresses.

## Render deployment

- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Add env vars from `.env` to Render service settings.

## GPT-4o copilot

- Set `OPENAI_API_KEY` and enable per-action flags:
  - `AI_TRIAGE_ENABLED=true` for inbound triage notes
  - `AI_DRAFT_ENABLED=true` for "Suggest reply"
  - `AI_REVIEW_ENABLED=true` for pre-send review (blocks send on failures)

## Key endpoints

- `POST /api/auth/login` -> agent login (returns token)
- `GET /api/auth/me` -> current agent
- `POST /api/auth/logout` -> revoke token
- `GET /api/threads` -> list inbox summaries
- `GET /api/threads/:id` -> fetch a full thread
- `PATCH /api/threads/:id/triage` -> status, priority, tags, assignment, internal notes
- `POST /api/threads/:id/reply` -> send a reply as the shared mailbox
- `POST /api/threads/:id/suggest-reply` -> GPT-4o draft suggestion (opt-in)
- `GET /api/threads/:id/attachments/:attachmentId` -> download a message attachment
- `POST /api/sync` -> trigger Gmail sync for `board` or `general`
- `POST /api/watch` -> register Gmail watch for `board` or `general`
- `POST /api/push` -> Pub/Sub push endpoint for Gmail updates
- `GET /api/stream` -> SSE stream for live UI updates
- `GET /api/agents` -> list agents for assignment
- `GET /api/admin/agents` -> admin agent management
- `POST /api/admin/agents/:id/reset` -> create password reset token
- `POST /api/admin/agents/:id/mfa` -> enable MFA + return QR
- `GET /api/admin/settings` -> tenant AI policy
- `GET /api/admin/theme` -> tenant brand theme
- `PATCH /api/admin/theme` -> update tenant brand theme
- `GET /api/admin/ai-usage` -> AI usage + spend summary
- `GET /api/admin/storage-health` -> Azure Blob container health
- `GET /api/admin/jobs` -> view tenant jobs
- `POST /api/admin/jobs/run` -> run queued jobs
- `GET /api/templates` -> list reply templates
- `POST /api/templates/render` -> render builder blocks (HTML + text)
- `GET /api/audit` -> admin audit log

## Notes

- Tenants are isolated: `board@dream-x.app` maps to `dream-x`, `general@playerxchange.org` maps to `playerxchange`.
- Admins and agents only see data inside their tenant.
- Gmail watch uses Pub/Sub. Configure the topic and point the push subscription to `/api/push`.
- Pub/Sub pushes are rate limited and optionally verified with Google JWT (`GMAIL_PUBSUB_JWT_AUDIENCE`).
- Incremental sync uses Gmail History API based on the latest `historyId` from watch/push.
- Full sync uses Gmail list pagination via `POST /api/sync` with `mode: "full"`.
- The UI listens to `/api/stream` for live updates and falls back to polling if SSE fails.
- Threading is based on Gmail thread IDs; message headers are stored for auditing.
- Data is stored in SQLite (`data/app.db`).
- Default demo agent passwords are set to `changeme` in the SQLite seed data (hashed at insert).
- GPT-4o support is opt-in per action and returns structured JSON only.
- AI usage must be enabled both in env flags and per-tenant admin policy.
- Attachments are stored in Azure Blob Storage and served via SAS URLs.
- MFA can be enabled per agent from the admin portal.
- Password resets are manual: admin generates a token link from the admin portal.
- Email Builder lives at `/admin/builder` and uses the tenant theme for branded HTML.

## TODO

All current TODOs are complete.

