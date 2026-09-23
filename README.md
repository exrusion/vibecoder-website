# VibeCoder

VibeCoder is an AI website builder for Solana token communities. Users can describe a site, import an existing project, or upload a visual reference, then edit and publish the result on a `*.vibecoder.website` subdomain.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## AI generation

The app works with a local fallback generator out of the box. Add `OPENROUTER_API_KEY` to enable hosted AI generation for all users. Individual users can also provide their own OpenRouter key in Builder Settings.

## Deployment

The production app runs on Railway with the standard Next.js build and start commands. Railway supplies `PORT` automatically; `next start` reads it.
