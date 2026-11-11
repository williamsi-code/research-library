ALTER TABLE "Topic" ADD COLUMN "conceptMap" JSONB,
ADD COLUMN "conceptMapAt" TIMESTAMP(3);

CREATE TABLE "ResearchItem" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),
    CONSTRAINT "ResearchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "dateLabel" TEXT NOT NULL,
    "sortValue" DOUBLE PRECISION,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceId" TEXT,
    "startPos" INTEGER,
    "endPos" INTEGER,
    "location" TEXT,
    "aiExtracted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "answerIndex" INTEGER,
    "answer" TEXT,
    "explanation" TEXT,
    "sourceId" TEXT,
    "startPos" INTEGER,
    "endPos" INTEGER,
    "location" TEXT,
    "timesAsked" INTEGER NOT NULL DEFAULT 0,
    "timesCorrect" INTEGER NOT NULL DEFAULT 0,
    "lastAskedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResearchItem_topicId_idx" ON "ResearchItem"("topicId");
CREATE INDEX "TimelineEvent_topicId_idx" ON "TimelineEvent"("topicId");
CREATE INDEX "QuizQuestion_topicId_idx" ON "QuizQuestion"("topicId");

ALTER TABLE "ResearchItem" ADD CONSTRAINT "ResearchItem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
