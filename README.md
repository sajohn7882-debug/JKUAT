<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/066e7efd-9fb1-41c8-9be6-7a961a6f0c8f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. In the Supabase SQL Editor, run [`supabase-schema.sql`](supabase-schema.sql).
4. Enable Google under Supabase Authentication > Providers and add your deployed URL plus `http://localhost:3000` to the redirect URLs.
5. Run the app:
   `npm run dev`

The server uses the Supabase service role key only on the server. Never expose that key in browser code or commit `.env`.

