import { z } from 'zod';

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Nama minimal 3 karakter')
    .max(100, 'Nama maksimal 100 karakter'),
  username: z
    .string()
    .trim()
    .min(3, 'Username minimal 3 karakter')
    .max(50, 'Username maksimal 50 karakter')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username hanya boleh huruf, angka, dan underscore',
    ),
  email: z
    .email('Email tidak valid')
    .trim()
    .toLowerCase()
    .max(255, 'Email maksimal 255 karakter'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
