import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import authRoutes from './routes/auth';
import photoRoutes from './routes/photos';
import profileRoutes from './routes/profile';
import subscriptionRoutes from './routes/subscription';
import videoJobRoutes from './routes/video-jobs';
import webhookRoutes from './routes/webhooks';
import adminRoutes from './routes/admin';
import campaignRoutes from './routes/campaign';
import supportRoutes from './routes/support';
import { errorHandler } from './middleware/error-handler';
import { startVideoJobProcessor } from './jobs/video-processor';
import { startCampaignStatusChecker } from './jobs/campaign-status-checker';
import { startCampaignStatsSync } from './jobs/campaign-stats-sync';
import { startWeeklyRecap } from './jobs/weekly-recap';

const app = express();
const PORT = process.env.PORT || 3001;

// Stripe webhook needs raw body BEFORE json parsing
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Static files for uploads (photos)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Static files for storage (videos)
app.use('/storage', express.static(path.join(__dirname, '../storage')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/video-jobs', videoJobRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/campaign', campaignRoutes);
app.use('/api/support', supportRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 CoachUp API running on http://localhost:${PORT}`);

  // Start video job processor in background
  startVideoJobProcessor();

  // Start campaign status checker in background (Story 4.2)
  startCampaignStatusChecker();

  // Start campaign stats sync in background (Story 5.1)
  startCampaignStatsSync();

  // Start weekly recap scheduler in background (Story 5.2)
  startWeeklyRecap();
});

export default app;
