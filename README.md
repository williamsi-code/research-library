# Research library

A private research workspace. You save web pages, PDFs and text, highlight passages, write notes, search everything, and ask questions that are answered only from your own sources. Every answer links to the exact passage it used.

Stack: Node.js/Express, Prisma, Postgres with pgvector, and React (Vite). It runs as one Railway service plus a database.

## What's in version 1

- **Library**: add a source by link, file upload (PDF, Markdown, text, saved HTML) or pasted text. Each source gets a topic, tags, a reading status and a "why I saved this" line.
- **Saved copies**: the readable text of every page is stored, so dead links don't lose your material. Uploaded files are stored too.
- **Reader**: select text to highlight it and add a note. PDFs show page markers, and highlights record their page.
- **Bookmarklet**: saves the page you're viewing, including pages behind logins. Any text you select is saved as a highlight.
- **Notes**: your own writing, kept separate from sources, linked to the sources it draws on. Saves automatically.
- **Search**: exact words and "quoted phrases", plus search by meaning when an OpenAI key is set.
- **Ask your sources**: Claude answers from the passages most relevant to your question, with numbered citations that open the passage. It's told to say when your sources don't cover something. "Save as note" turns an answer into a draft note that's marked as AI-written.
- **AI summary**: per-source summary, key claims and suggested tags, clearly labelled as AI-written.
- **Review**: brings back three older highlights at a time and asks what you think now. Your reply is added to the highlight's note with the date.
- **Export**: everything as Markdown or JSON from Settings.

## Set it up on Railway

These steps use the GitHub Desktop app and the Railway website.

### 1. Put the code on GitHub

1. In GitHub Desktop, choose **File → New repository**. Name it `research-library` and create it.
2. Click **Show in Finder/Explorer**, then copy everything from this folder into it (including the hidden `.gitignore` file).
3. Back in GitHub Desktop, type a commit message such as "First version", click **Commit to main**, then **Publish repository**. Keep it private.

### 2. Create the database

Railway's standard Postgres doesn't include pgvector, so use the pgvector template.

1. In Railway, click **New Project → Deploy a template**, search for **pgvector**, and deploy it.
2. Wait until it shows as running.

### 3. Add the app

1. In the same project, click **+ New → GitHub Repo** and choose `research-library`.
2. Open the new service and go to **Variables**. Add:
   - `DATABASE_URL`: click **Add Reference** and choose the pgvector service's `DATABASE_URL`.
   - `APP_PASSWORD`: the password you'll sign in with. Make it long.
   - `CLIP_TOKEN`: any long random text, such as 40 random letters and numbers. It's built into your bookmarklet.
   - `UPLOAD_DIR`: `/data/uploads`
   - `ANTHROPIC_API_KEY`: from console.anthropic.com. Needed for Ask and Summarize.
   - `OPENAI_API_KEY`: from platform.openai.com. Needed for search by meaning. Without it, search matches exact words only.
3. Go to **Settings → Volumes** (or right-click the service and add a volume), and mount a volume at `/data`. Without this, uploaded files disappear on every deploy.
4. Under **Settings → Networking**, click **Generate Domain**.
5. Railway deploys automatically. The first start creates the database tables.

Open the domain, sign in with your `APP_PASSWORD`, and go to **Settings** to drag the bookmarklet to your bookmarks bar.

### Updating later

Replace files in your GitHub Desktop folder, commit and push. Railway redeploys on its own.

## Good to know

- **Costs**: embedding a long article with OpenAI costs a fraction of a cent. Each question sends about 12 passages to Claude. Summaries send the whole source, up to about 120,000 characters.
- **Changing the Claude model**: set a `CLAUDE_MODEL` variable. The default is `claude-sonnet-5-5`.
- **Embedding model**: the database expects 1,536-dimension vectors, which matches the default `text-embedding-3-small`. Don't change `EMBEDDING_MODEL` without also changing the database column.
- **Adding an OpenAI key later**: open each source and click "Rebuild search index for this source" to make older sources searchable by meaning.
- **Bookmarklet limits**: a few sites (GitHub, for example) block pages from sending data elsewhere. For those, copy the link and use **Add source**.
- **Scanned PDFs** have no text layer and are refused with a clear message. OCR could come in a later version.
- **Security**: one password protects everything. Sign-in attempts are rate-limited. Page content sent to Claude is marked as untrusted, and Claude is told to ignore any instructions inside it.

## Project layout

```
server/          Express API
  index.js       entry point, serves the built React app
  auth.js        single-password sign-in
  lib/           text extraction, chunking, AI calls, search
  routes/        sources, highlights, notes, ask, clip, and the rest
prisma/          database schema and migration
client/          React app (Vite)
```

## Running on your own computer (optional)

Requires Node 20+ and a Postgres database with pgvector. Copy `.env.example` to `.env` and fill it in, then:

```
npm install
npx prisma migrate deploy
npm run dev:server     # API on port 3000
npm run dev:client     # app on port 5173
```
