-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "metaAdId" TEXT,
    "metaVideoId" TEXT,
    "status" TEXT NOT NULL,
    "rejectReason" TEXT,
    "dailyBudget" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "launchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_coachId_key" ON "Campaign"("coachId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE;
