-- pgvector (requires the Railway pgvector Postgres template)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "siteName" TEXT,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "text" TEXT NOT NULL,
    "segments" JSONB NOT NULL DEFAULT '[]',
    "excerpt" TEXT,
    "whySaved" TEXT,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'to_read',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topicId" TEXT,
    "processing" TEXT NOT NULL DEFAULT 'pending',
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "startPos" INTEGER NOT NULL,
    "endPos" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "location" TEXT,
    "embedding" vector(1536),
    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "startPos" INTEGER,
    "endPos" INTEGER,
    "location" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NoteSource" (
    "noteId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    CONSTRAINT "NoteSource_pkey" PRIMARY KEY ("noteId","sourceId")
);

CREATE UNIQUE INDEX "Topic_name_key" ON "Topic"("name");
CREATE INDEX "Source_topicId_idx" ON "Source"("topicId");
CREATE INDEX "Source_url_idx" ON "Source"("url");
CREATE INDEX "Chunk_sourceId_idx" ON "Chunk"("sourceId");
CREATE INDEX "Highlight_sourceId_idx" ON "Highlight"("sourceId");
CREATE INDEX "Note_topicId_idx" ON "Note"("topicId");

-- Keyword search and semantic search indexes
CREATE INDEX "Chunk_text_fts_idx" ON "Chunk" USING GIN (to_tsvector('english', "text"));
CREATE INDEX "Chunk_embedding_hnsw_idx" ON "Chunk" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "Source" ADD CONSTRAINT "Source_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NoteSource" ADD CONSTRAINT "NoteSource_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteSource" ADD CONSTRAINT "NoteSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
