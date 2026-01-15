import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../services/auth-service';

// Extend Express Request type to include coach
declare global {
  namespace Express {
    interface Request {
      coach?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentification requise',
        },
      });
    }

    const payload = verifyToken(token);
    req.coach = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token invalide ou expiré',
      },
    });
  }
}
