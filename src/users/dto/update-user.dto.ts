import { z } from 'zod';

export const updateUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Nama minimal 3 karakter')
    .max(100, 'Nama maksimal 100 karakter')
    .optional(),

  username: z
    .string()
    .trim()
    .min(3, 'Username minimal 3 karakter')
    .max(50, 'Username maksimal 50 karakter')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username hanya boleh huruf, angka, dan underscore',
    )
    .optional(),

  email: z
    .email('Email tidak valid')
    .trim()
    .toLowerCase()
    .max(255, 'Email maksimal 255 karakter')
    .optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
