# Design Room

A shared design workspace with freeform canvases, Kanban boards, and Markdown documents. Boards, images, documents, and workspace settings load from an authenticated API. The public repository and GitHub Pages build contain application code only.

## Open and sign in

Open the `siteUrl` in [workspace.config.json](workspace.config.json). Workspace access follows **write, maintain, or admin membership** in the repository configured on the backend.

For local GitHub CLI sign-in:

```sh
npm ci
gh auth login
npm run login
```

Then click **Connect local GitHub CLI** on the website. A one-use localhost bridge exchanges your existing GitHub sign-in for an 8-hour app session. The bridge accepts only the configured site origin and local development origins, and closes after connection or four minutes. Your browser may ask permission to access the local network. No GitHub token appears in the browser or command output.

Alternatively, use a fine-grained GitHub personal access token with Metadata read access to the backend's membership repository. The API verifies identity and repository permissions, then discards the GitHub token. The app session stays in this browser tab's session storage. Removing membership prevents new sessions; already-issued sessions expire within eight hours.

## Coding agents

Use the standard CLI; no Sites tools or special agent integration are required:

```sh
npm run board -- list
npm run board -- read BOARD_ID
npm run board -- context BOARD_ID
npm run board -- docs
npm run board -- docs docs/example.md
```

To edit safely, save the `read` JSON response outside this public repository, modify its `board`, and keep its `revision`. Then:

```sh
npm run board -- save BOARD_ID /private/path/board-envelope.json
```

A stale revision returns HTTP 409. Re-read, compare, and merge deliberately. The `context` view includes explicit edges, spatial frames, nearby unconnected notes, document links, and development status. Proximity is a hint; it is not an explicit relationship. See [AGENTS.md](AGENTS.md) and [API](docs/API.md).

`npm run board -- export /private/path/backup` backs up board JSON. Images and repository document snapshots live in private S3 and are protected by bucket versioning. Never commit exports, screenshots, game assets, or workspace documents here.

## Develop

Node 22+, npm, and GitHub CLI are used locally. Copy `.env.example` to `.env.local` and set `VITE_API_URL` to the API from `workspace.config.json`.

```sh
npm ci
npm run dev
npm test
npm run build
```

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
