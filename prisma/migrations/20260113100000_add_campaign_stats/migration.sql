-- CreateTable
CREATE TABLE "CampaignStats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION,
    "cpc" DOUBLE PRECISION,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignStats_campaignId_key" ON "CampaignStats"("campaignId");

-- AddForeignKey
ALTER TABLE "CampaignStats" ADD CONSTRAINT "CampaignStats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
