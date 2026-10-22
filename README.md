# Design Room

A shared design workspace with freeform canvases, Kanban boards, Markdown documents, and questionnaires. Boards, images, documents, and workspace settings load from an authenticated API. The public repository and GitHub Pages build contain application code only.

## Open and sign in

Open the `siteUrl` in [workspace.config.json](workspace.config.json). Workspace access follows **write, maintain, or admin membership** in the repository configured on the backend.

Click **Sign in with GitHub**, approve the app, and return to your boards. The app requests only repository metadata read access and verifies your write membership before creating an 8-hour session. GitHub tokens are exchanged on the backend and discarded after verification.

The workspace administrator enables this once with `npm run setup:github`. Follow its local registration link, register the preconfigured GitHub App, then install it on **only the membership repository**. The setup helper automatically stores the client secret as encrypted Pulumi configuration and deploys it to Lambda. Nothing secret goes into the public app or repository. GitHub App registration belongs to your GitHub account; the helper discards the unused app private key and webhook secret. Other members do not need to run setup or install the app themselves. If installation or repository selection is missing, sign-in displays an in-app setup screen with the exact repository, a GitHub installation link, and a Continue button. The owner completes setup in another tab and continues sign-in here.

Optional developer fallback, for local GitHub CLI sign-in:

```sh
npm ci
gh auth login
npm run login
```

Then click **Connect local GitHub CLI** on the website. A one-use localhost bridge exchanges your existing GitHub sign-in for an 8-hour app session. The bridge accepts only the configured site origin and local development origins, and closes after connection or four minutes. Your browser may ask permission to access the local network. No GitHub token appears in the browser or command output.

The Developer sign-in options also accept a fine-grained GitHub personal access token with Metadata read access to the backend's membership repository. The API verifies identity and repository permissions, then discards the GitHub token. The app session stays in this browser tab's session storage. Removing membership prevents new sessions; already-issued sessions expire within eight hours.

## Coding agents

Agents do not need to clone this repository. Open the site's **Agent context** panel and copy the connection instructions, or follow `llms.txt`, `agents.json`, or `agents.html` beside the homepage. The instructions are public; board content stays private.

Download the hosted standalone `agent.mjs` client to a temporary/private directory and run it with Node 22+. It has no package dependencies. Its `list`, `read`, `context`, `save`, `catalog`, `docs`, `asset`, and `export` commands use the live API directly. An existing GitHub CLI login works automatically, and the GitHub token is never stored.

Without GitHub CLI, use `node /tmp/design-room-agent.mjs auth pair --label "My agent"`. The agent displays a short code and approval URL. A signed-in member checks the matching code and explicitly grants read-only or read/write access. The default is read-only even when write was requested. Approval requests expire after ten minutes; approved sessions last eight hours. The approval page can revoke access immediately. The device secret and issued session never appear in the approval URL or command output. Local session files use owner-only permissions; `DESIGN_ROOM_SESSION_FILE` overrides their location.

Any HTTP-capable agent can use the pairing and board APIs directly; the client is optional. See [API](docs/API.md). The site's static instructions contain the live API address and request examples, so this repository is not needed to discover endpoints or authenticate.

To edit safely, read a board's `{board,revision}` envelope, change only the intended fields, and submit it with `save BOARD_ID /private/path/envelope.json` or `PUT /api/board?board=ID`. A stale revision returns 409. Re-read, compare, and merge deliberately. Never commit private exports, session files, game assets, or document snapshots to a public repository.

For agents already working in this checkout, `npm run board -- list` and the existing repository CLI remain supported. Agent context includes explicit edges, spatial frames, nearby unconnected notes, document references, and development status. Proximity is a hint, not a confirmed relationship.

## Develop

Node 22+, npm, and GitHub CLI are used locally. Copy `.env.example` to `.env.local` and set `VITE_API_URL` to the API from `workspace.config.json`.

```sh
npm ci
npm run dev
npm test
npm run build
```

Use a board’s menu to **Pin board** or **Unpin board**. Pins are shared across the workspace and appear above other boards. Pinned boards can be reordered within their section; archiving a board removes its pin.

All views use live database editing. Kanban, documents, and freeform boards keep independent content. Wiki links such as `[[docs/example.md|Example]]` and `[[board:BOARD_ID#ITEM_ID|Item]]` work in notes and Markdown tables.

## Hosting and infrastructure

GitHub Pages serves the public React/Vite app. `.github/workflows/pages.yml` builds and deploys on pushes to `main`, using the repository variable `API_URL`. There are no AWS credentials in the frontend workflow.

Pulumi manages an AWS HTTP API, one Node 22 ARM Lambda, an on-demand DynamoDB table, and a private S3 bucket. DynamoDB tracks catalog and content revisions; immutable S3 objects hold board content, documents, and assets. Conditional transactions prevent lost updates. S3 public access is blocked; authenticated asset requests receive five-minute signed URLs. Data storage has encryption, versioning, and DynamoDB point-in-time recovery. The table and bucket have Pulumi deletion protection.

Infrastructure commands use local AWS credentials. The deployment region defaults to `us-east-1`:

```sh
npm run build:api
npm run infra -- preview
npm run infra -- up --yes
```

For a new deployment, bootstrap encrypted configuration and state first:

```sh
npm run infra -- bootstrap OWNER/MEMBERSHIP_REPO https://OWNER.github.io
```

State lives in `s3://design-room-pulumi-state-ACCOUNT_ID`. The passphrase is stored as an SSM SecureString at `/design-room/pulumi-passphrase`. The runner retrieves it into process memory. Actual stack configuration is ignored by Git. The bootstrap state bucket is initialized by the runner; the app resources are managed by Pulumi.

To change membership repository or allowed origins, use Pulumi configuration in the `infra` directory and redeploy. To invalidate every app session immediately, rotate the encrypted `sessionKey` and redeploy. Anyone with an approved role can edit all boards; there is no read-only workspace role yet.

Private migration utility: `node scripts/migrate.mjs PRIVATE_BACKUP OLD_SOURCE WORKSPACE_TITLE`. It reads local private exports and requires ignored `work/infra-outputs.json`; it refuses to replace an existing catalog. Do not use it against an active workspace.

## Questionnaires and explicit handoffs

Create a **Questionnaire** board for design questions or playtest criteria. Prompts and source links are separate from answers. Drafts save after a short pause; edits during a save remain local until the next save. Concurrent changes stop autosave and preserve the draft for export/reconciliation. Editing and marking ready never send messages. **Review & submit** shows the exact answers and recipients before the human confirms. Only ready, nonblank answers are included. Later edits create a new draft; previous submissions retain immutable wording, author and board revision. Authorized transcriptions of decisions from another chat can carry the exact answer, original prompt, author, date and source in `question.chatAnswer`; the view labels them **Answered in chat**, never as a questionnaire submission.

The private `CONFIG.reviewRouting` setting contains `{coordinator, copies}` agent names. Every submission goes to the coordinator; individual questions opt into specialist copies. These names and all question content are runtime configuration, never application source. Paired agent sessions can read submissions and, with authorized write access, prepare questions; they cannot submit human decisions or acknowledge delivery.

Submissions atomically enter a durable outbox in the existing DynamoDB table, with immutable S3 snapshots. The local `scripts/review-relay.mjs` service checks only this explicit-submission queue every 30 seconds. It sends `handoff` events through the existing bridge CLI, with exact questions/answers, stable references, revision, author and a stable per-recipient/per-part dedupe key. Long answers split into numbered parts without changing their text. It acknowledges the outbox only after the bridge persists every part. A restart repeats the same dedupe keys, preventing duplicate handoffs. No bridge transport code, automatic board-status writes or game-repo changes are involved.

On the bridge host, with an existing GitHub CLI login and the sender registered in the bridge:

```sh
node scripts/install-review-relay.mjs
systemctl --user status design-room-review-relay.service
journalctl --user -u design-room-review-relay.service
# Disable delivery without deleting queued submissions:
systemctl --user disable --now design-room-review-relay.service
```

The service uses GitHub CLI credentials in memory, refreshes its API session, and remains quiet while healthy. It survives chat closure and starts on future logins; it requires this host and bridge to be running. `DESIGN_ROOM_BRIDGE`, `DESIGN_ROOM_SENDER` and `DESIGN_ROOM_API` override local defaults. The browser shows queued versus delivered-to-bridge status and a service heartbeat. Delivery is not agent review or build approval. The submission is the human's decision on the answered questions; canonical documentation and build planning stay with the coordinator.
