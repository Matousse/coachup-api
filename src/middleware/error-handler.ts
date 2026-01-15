import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Always log the error
  console.error('Error:', err);

  // Zod validation errors
  if (err instanceof ZodError) {
    const issues = err.issues || [];
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: issues[0]?.message || 'Donnees invalides',
        details: issues,
      },
    });
  }

  // Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Fichier trop volumineux. Maximum 10MB',
        },
      });
    }
    return res.status(400).json({
      error: {
        code: 'UPLOAD_ERROR',
        message: 'Erreur lors de l\'upload',
      },
    });
  }

  // Custom upload errors
  if (err.message === 'FORMAT_INVALID') {
    return res.status(400).json({
      error: {
        code: 'FORMAT_INVALID',
        message: 'Format non supporte. Utilisez JPG ou PNG',
      },
    });
  }

  // Known business errors
  if (err.message === 'EMAIL_EXISTS') {
    return res.status(409).json({
      error: {
        code: 'EMAIL_EXISTS',
        message: 'Cet email est déjà utilisé',
      },
    });
  }

  if (err.message === 'INVALID_CREDENTIALS') {
    return res.status(401).json({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Email ou mot de passe incorrect',
      },
    });
  }

  // Default error
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur interne est survenue',
    },
  });
}
