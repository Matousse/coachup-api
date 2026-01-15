import { Router, Request, Response, NextFunction } from 'express';
import { RegisterSchema, LoginSchema } from '../schemas/auth';
import { createCoach, loginCoach, getCoachById } from '../services/auth-service';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = RegisterSchema.parse(req.body);
    const { coach, token } = await createCoach(validated);

    res.cookie('token', token, COOKIE_OPTIONS);

    return res.status(201).json({
      data: { coach },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = LoginSchema.parse(req.body);
    const { coach, token } = await loginCoach(validated);

    res.cookie('token', token, COOKIE_OPTIONS);

    return res.json({
      data: { coach },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.coach) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Non authentifié' },
      });
    }

    const coach = await getCoachById(req.coach.coachId);

    if (!coach) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Coach non trouvé' },
      });
    }

    return res.json({
      data: { coach },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  return res.json({
    data: { message: 'Déconnexion réussie' },
  });
});

export default router;
