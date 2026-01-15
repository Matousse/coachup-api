-- AlterTable: Add Meta Ads fields to Coach
ALTER TABLE "Coach" ADD COLUMN "metaAdAccountId" TEXT;
ALTER TABLE "Coach" ADD COLUMN "queuedForMeta" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: Alert
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "coachId" TEXT,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE SET NULL ON UPDATE CASCADE;
