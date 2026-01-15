-- Add email preferences to Coach model (Story 5.2)
ALTER TABLE "Coach" ADD COLUMN "emailWeeklyRecap" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Coach" ADD COLUMN "emailCampaignLive" BOOLEAN NOT NULL DEFAULT true;
