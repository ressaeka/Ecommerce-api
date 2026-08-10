import { z } from 'zod';

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string('Refresh token wajib diisi')
    .min(1, 'Refresh token wajib diisi'),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
