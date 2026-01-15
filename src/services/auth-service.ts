import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { RegisterInput, LoginInput } from '../schemas/auth';
import { prisma } from '../lib/prisma';
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const SALT_ROUNDS = 10;

export interface JwtPayload {
  coachId: string;
  email: string;
}

export async function createCoach(input: RegisterInput) {
  // Check if email already exists
  const existingCoach = await prisma.coach.findUnique({
    where: { email: input.email },
  });

  if (existingCoach) {
    throw new Error('EMAIL_EXISTS');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);

  // Create coach
  const coach = await prisma.coach.create({
    data: {
      email: input.email,
      password: hashedPassword,
      name: input.name,
      phone: input.phone,
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      createdAt: true,
    },
  });

  // Generate JWT
  const token = generateToken({ coachId: coach.id, email: coach.email });

  return { coach, token };
}

export async function loginCoach(input: LoginInput) {
  // Find coach by email
  const coach = await prisma.coach.findUnique({
    where: { email: input.email },
  });

  if (!coach) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(input.password, coach.password);

  if (!isValidPassword) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // Generate JWT
  const token = generateToken({ coachId: coach.id, email: coach.email });

  return {
    coach: {
      id: coach.id,
      email: coach.email,
      name: coach.name,
      phone: coach.phone,
    },
    token,
  };
}

export async function getCoachById(coachId: string) {
  const coach = await prisma.coach.findUnique({
    where: { id: coachId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      description: true,
      specialty: true,
      city: true,
      radius: true,
      instagramUrl: true,
      websiteUrl: true,
      createdAt: true,
    },
  });

  return coach;
}

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
