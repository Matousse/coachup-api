import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

// Upload directory
const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/png'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('FORMAT_INVALID'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// POST /api/photos/upload
router.post(
  '/upload',
  authMiddleware,
  upload.single('photo'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: { code: 'NO_FILE', message: 'Aucun fichier fourni' },
        });
      }

      if (!req.coach) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
        });
      }

      // Check existing photos count
      const existingPhotos = await prisma.photo.count({
        where: { coachId: req.coach.coachId },
      });

      if (existingPhotos >= 2) {
        // Delete uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: { code: 'MAX_PHOTOS', message: 'Maximum 2 photos autorisees' },
        });
      }

      // Save to database
      const photo = await prisma.photo.create({
        data: {
          url: `/uploads/${req.file.filename}`,
          filename: req.file.filename,
          coachId: req.coach.coachId,
        },
      });

      return res.status(201).json({
        data: {
          photo: {
            id: photo.id,
            url: photo.url,
            filename: photo.filename,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/photos
router.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.coach) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
      });
    }

    const photos = await prisma.photo.findMany({
      where: { coachId: req.coach.coachId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      data: {
        photos: photos.map((p) => ({
          id: p.id,
          url: p.url,
          filename: p.filename,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/photos/:id
router.delete('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.coach) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Non authentifie' },
      });
    }

    const photoId = req.params.id as string;
    const photo = await prisma.photo.findFirst({
      where: {
        id: photoId,
        coachId: req.coach.coachId,
      },
    });

    if (!photo) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Photo non trouvee' },
      });
    }

    // Delete file
    const filePath = path.join(UPLOAD_DIR, photo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await prisma.photo.delete({
      where: { id: photo.id },
    });

    return res.json({
      data: { message: 'Photo supprimee' },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
