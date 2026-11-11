ALTER TABLE "Topic" ADD COLUMN "explanationDraft" TEXT;
ALTER TABLE "Source" ADD COLUMN "pendingOcr" JSONB;

CREATE TABLE "ExplanationCheck" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExplanationCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "ExplanationCheck_topicId_idx" ON "ExplanationCheck"("topicId");

ALTER TABLE "ExplanationCheck" ADD CONSTRAINT "ExplanationCheck_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
