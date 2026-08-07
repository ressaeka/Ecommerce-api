import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string('Username wajib diisi')
    .trim()
    .min(1, 'Username wajib diisi'),

  password: z.string('Password wajib diisi').min(1, 'Password wajib diisi'),
});

export type LoginDto = z.infer<typeof loginSchema>;
