import { z } from 'zod';

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, 'Reset token wajib diisi'),
  newPassword: z.string().min(8, 'Password minimal 8 karakter'),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
