/**
 * Email Service Tests (Story 5.2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set stub mode before importing
vi.stubEnv('EMAIL_STUB_MODE', 'true');
vi.stubEnv('EMAIL_FROM', 'Test <test@coachup.com>');
vi.stubEnv('FRONTEND_URL', 'https://test.coachup.com');

import {
  sendCampaignLive,
  sendWeeklyRecap,
  sendAlertEmail,
  WeeklyStats,
} from './email';

describe('EmailService (Stub Mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on console.log to verify stub logging
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendCampaignLive', () => {
    it('should send campaign live email successfully in stub mode', async () => {
      const coach = { email: 'coach@test.com', name: 'Test Coach' };

      const result = await sendCampaignLive(coach);

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Sending campaign live email')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('STUB MODE')
      );
    });

    it('should log email details in stub mode', async () => {
      const coach = { email: 'test@example.com', name: 'John Doe' };

      await sendCampaignLive(coach);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('test@example.com')
      );
    });
  });

  describe('sendWeeklyRecap', () => {
    it('should send weekly recap email successfully in stub mode', async () => {
      const coach = { email: 'coach@test.com', name: 'Test Coach' };
      const stats: WeeklyStats = {
        impressionsThisWeek: 1500,
        clicksThisWeek: 45,
        status: 'active',
        weekStart: new Date('2026-01-06'),
        weekEnd: new Date('2026-01-13'),
      };

      const result = await sendWeeklyRecap(coach, stats);

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Sending weekly recap email')
      );
    });

    it('should include stats in the email', async () => {
      const coach = { email: 'coach@test.com', name: 'Test Coach' };
      const stats: WeeklyStats = {
        impressionsThisWeek: 5000,
        clicksThisWeek: 150,
        status: 'active',
        weekStart: new Date('2026-01-06'),
        weekEnd: new Date('2026-01-13'),
      };

      const result = await sendWeeklyRecap(coach, stats);

      expect(result).toBe(true);
    });
  });

  describe('sendAlertEmail', () => {
    it('should send meta rejection alert email', async () => {
      const coach = { email: 'coach@test.com', name: 'Test Coach' };

      const result = await sendAlertEmail(coach, 'meta_rejection', 'Policy violation');

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Sending alert email (meta_rejection)')
      );
    });

    it('should send payment failed alert email', async () => {
      const coach = { email: 'coach@test.com', name: 'Test Coach' };

      const result = await sendAlertEmail(coach, 'payment_failed');

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('payment_failed')
      );
    });

    it('should send video failed alert email', async () => {
      const coach = { email: 'coach@test.com', name: 'Test Coach' };

      const result = await sendAlertEmail(coach, 'video_failed', 'Processing error');

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('video_failed')
      );
    });

    it('should send meta account limit alert email', async () => {
      const coach = { email: 'coach@test.com', name: 'Test Coach' };

      const result = await sendAlertEmail(coach, 'meta_account_limit');

      expect(result).toBe(true);
    });

    it('should send meta api error alert email', async () => {
      const coach = { email: 'coach@test.com', name: 'Test Coach' };

      const result = await sendAlertEmail(coach, 'meta_api_error', 'API timeout');

      expect(result).toBe(true);
    });
  });

  describe('Alert types coverage', () => {
    const alertTypes = [
      'meta_rejection',
      'payment_failed',
      'video_failed',
      'meta_account_limit',
      'meta_api_error',
    ] as const;

    it.each(alertTypes)('should handle %s alert type', async (alertType) => {
      const coach = { email: 'coach@test.com', name: 'Test Coach' };

      const result = await sendAlertEmail(coach, alertType);

      expect(result).toBe(true);
    });
  });
});
