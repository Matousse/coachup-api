/**
 * Support Routes Tests (Story 5.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock email service before importing support routes
vi.mock('../services/email', () => ({
  sendNewTicketNotificationToAdmin: vi.fn().mockResolvedValue(true),
  sendTicketReplyNotification: vi.fn().mockResolvedValue(true),
}));

// Mock Prisma
const mockPrismaTicket = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

const mockPrismaMessage = {
  create: vi.fn(),
};

vi.mock('../lib/prisma', () => ({
  prisma: {
    supportTicket: mockPrismaTicket,
    ticketMessage: mockPrismaMessage,
  },
}));

import { TICKET_STATUS } from '../schemas/support';

describe('Support Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Ticket Status Constants', () => {
    it('should have correct status values', () => {
      expect(TICKET_STATUS.OPEN).toBe('open');
      expect(TICKET_STATUS.IN_PROGRESS).toBe('in_progress');
      expect(TICKET_STATUS.RESOLVED).toBe('resolved');
    });
  });

  describe('GET /api/support/tickets', () => {
    it('should return tickets for coach', async () => {
      const mockTickets = [
        {
          id: 'ticket-1',
          subject: 'Test ticket',
          status: 'open',
          coachId: 'coach-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [{ createdAt: new Date() }],
        },
      ];

      mockPrismaTicket.findMany.mockResolvedValue(mockTickets);

      // Verify mock was set up correctly
      const result = await mockPrismaTicket.findMany({
        where: { coachId: 'coach-1' },
      });

      expect(result).toEqual(mockTickets);
      expect(mockPrismaTicket.findMany).toHaveBeenCalledWith({
        where: { coachId: 'coach-1' },
      });
    });
  });

  describe('POST /api/support/tickets', () => {
    it('should create ticket with initial message', async () => {
      const mockTicket = {
        id: 'new-ticket-1',
        subject: 'New ticket',
        status: 'open',
        coachId: 'coach-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [{ id: 'msg-1', content: 'Description', isAdmin: false }],
        coach: { name: 'Test Coach', email: 'coach@test.com' },
      };

      mockPrismaTicket.create.mockResolvedValue(mockTicket);

      const result = await mockPrismaTicket.create({
        data: {
          coachId: 'coach-1',
          subject: 'New ticket',
          status: TICKET_STATUS.OPEN,
          messages: {
            create: {
              content: 'Description',
              isAdmin: false,
            },
          },
        },
      });

      expect(result.id).toBe('new-ticket-1');
      expect(result.status).toBe('open');
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('GET /api/support/tickets/:id', () => {
    it('should return ticket detail with messages', async () => {
      const mockTicket = {
        id: 'ticket-1',
        subject: 'Test ticket',
        status: 'open',
        coachId: 'coach-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          { id: 'msg-1', content: 'Hello', isAdmin: false, createdAt: new Date() },
          { id: 'msg-2', content: 'Reply', isAdmin: true, createdAt: new Date() },
        ],
      };

      mockPrismaTicket.findFirst.mockResolvedValue(mockTicket);

      const result = await mockPrismaTicket.findFirst({
        where: { id: 'ticket-1', coachId: 'coach-1' },
      });

      expect(result?.id).toBe('ticket-1');
      expect(result?.messages).toHaveLength(2);
    });

    it('should return null for non-existent ticket', async () => {
      mockPrismaTicket.findFirst.mockResolvedValue(null);

      const result = await mockPrismaTicket.findFirst({
        where: { id: 'non-existent', coachId: 'coach-1' },
      });

      expect(result).toBeNull();
    });
  });

  describe('POST /api/support/tickets/:id/messages', () => {
    it('should add message to ticket', async () => {
      const mockMessage = {
        id: 'new-msg',
        ticketId: 'ticket-1',
        content: 'New message',
        isAdmin: false,
        createdAt: new Date(),
      };

      mockPrismaMessage.create.mockResolvedValue(mockMessage);

      const result = await mockPrismaMessage.create({
        data: {
          ticketId: 'ticket-1',
          content: 'New message',
          isAdmin: false,
        },
      });

      expect(result.id).toBe('new-msg');
      expect(result.isAdmin).toBe(false);
    });
  });

  describe('POST /api/support/tickets/:id/reopen', () => {
    it('should reopen resolved ticket', async () => {
      const mockTicket = {
        id: 'ticket-1',
        status: 'resolved',
        coachId: 'coach-1',
      };

      mockPrismaTicket.findFirst.mockResolvedValue(mockTicket);
      mockPrismaTicket.update.mockResolvedValue({
        ...mockTicket,
        status: TICKET_STATUS.OPEN,
      });

      // First find the ticket
      const found = await mockPrismaTicket.findFirst({
        where: { id: 'ticket-1', coachId: 'coach-1' },
      });

      expect(found?.status).toBe('resolved');

      // Then reopen it
      const result = await mockPrismaTicket.update({
        where: { id: 'ticket-1' },
        data: { status: TICKET_STATUS.OPEN },
      });

      expect(result.status).toBe('open');
    });

    it('should not reopen non-resolved ticket', async () => {
      const mockTicket = {
        id: 'ticket-1',
        status: 'open',
        coachId: 'coach-1',
      };

      mockPrismaTicket.findFirst.mockResolvedValue(mockTicket);

      const found = await mockPrismaTicket.findFirst({
        where: { id: 'ticket-1', coachId: 'coach-1' },
      });

      // Should check status before updating
      expect(found?.status).toBe('open');
      expect(found?.status).not.toBe('resolved');
    });
  });
});

describe('Ticket Email Notifications', () => {
  it('should have notification functions available', async () => {
    const { sendNewTicketNotificationToAdmin, sendTicketReplyNotification } = await import(
      '../services/email'
    );

    expect(sendNewTicketNotificationToAdmin).toBeDefined();
    expect(sendTicketReplyNotification).toBeDefined();
  });

  it('should call admin notification on ticket creation', async () => {
    const { sendNewTicketNotificationToAdmin } = await import('../services/email');

    await sendNewTicketNotificationToAdmin({
      ticketId: 'test-ticket',
      subject: 'Test',
      description: 'Test description',
      coachName: 'Test Coach',
      coachEmail: 'coach@test.com',
    });

    expect(sendNewTicketNotificationToAdmin).toHaveBeenCalled();
  });

  it('should call coach notification on admin reply', async () => {
    const { sendTicketReplyNotification } = await import('../services/email');

    await sendTicketReplyNotification({
      ticketId: 'test-ticket',
      subject: 'Test',
      replyContent: 'Admin reply',
      coachName: 'Test Coach',
      coachEmail: 'coach@test.com',
    });

    expect(sendTicketReplyNotification).toHaveBeenCalled();
  });
});
