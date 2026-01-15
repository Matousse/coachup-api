import { Router, Request, Response } from 'express';
import { stripe } from '../services/stripe';
import { prisma } from '../lib/prisma';
import Stripe from 'stripe';

const router = Router();

// POST /api/webhooks/stripe - Stripe webhook handler
// Note: This route needs raw body, not JSON parsed
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  if (!sig) {
    console.error('Webhook Error: No stripe-signature header');
    return res.status(400).send('No signature');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, // Must be raw body
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const coachId = session.client_reference_id;

      // Distinguish between subscription and one-shot payment
      if (session.mode === 'subscription') {
        // Subscription payment (existing logic)
        const subscriptionId = session.subscription as string;
        if (coachId && subscriptionId) {
          try {
            await prisma.subscription.update({
              where: { coachId },
              data: {
                status: 'active',
                stripeSubId: subscriptionId,
              },
            });
            console.log(`Subscription activated for coach ${coachId}`);
          } catch (dbError) {
            console.error('Database update failed:', dbError);
          }
        }
      } else if (session.mode === 'payment' && session.metadata?.type === 'video_regeneration') {
        // Video regeneration one-shot payment
        if (coachId) {
          try {
            await prisma.videoJob.create({
              data: {
                coachId,
                status: 'pending',
                regeneration: true,
                paymentSessionId: session.id,
              },
            });
            console.log(`Video regeneration initiated for coach ${coachId}`);
          } catch (dbError) {
            console.error('VideoJob creation failed:', dbError);
          }
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const stripeSubId = subscription.id;

      try {
        await prisma.subscription.updateMany({
          where: { stripeSubId },
          data: { status: 'cancelled' },
        });
        console.log(`Subscription ${stripeSubId} cancelled`);
      } catch (dbError) {
        console.error('Database update failed:', dbError);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`Payment failed for invoice ${invoice.id}`);
      // Could send email notification here
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 200 to acknowledge receipt
  return res.json({ received: true });
});

export default router;
