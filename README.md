# Beam

Beam transfers files directly between a desktop browser and a phone. The
session service handles pairing and signaling; file contents are not stored in
the database.

## Local development

Install the root dependencies once:

```bash
npm install
```

Install the session service dependencies once:

```bash
cd mini-services/session-service
bun install
cd ../..
```

Start both the Next.js app and session service together:

```bash
npm run dev
```

Open `http://localhost:3000`. The startup script checks that the session
service responds at `http://127.0.0.1:3003/healthz`; it stops with a useful
error if port 3003 is serving an old process or is unavailable.

For a production-mode local run:

```bash
npm run build
npm start
```

`npm start` starts both services and requires the build from `npm run build`.
Press Ctrl+C to stop the services started by that command.

## Render and Turso

Deploy the repository as a Render Blueprint using `render.yaml`. It defines two
native Node/Bun services, a web app and a separate session service, and wires
their public URLs together. It does not require Docker. Set `TURSO_DATABASE_URL`
and `TURSO_AUTH_TOKEN` on the `beam-web` service if you want session metadata
stored in Turso. Run
`prisma/turso-schema.sql` once against that database first.

Turso stores session metadata only. Live pairing state stays in memory in the
session service, and file contents are transferred peer-to-peer or relayed; they
are not written to Turso.
