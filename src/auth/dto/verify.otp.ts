import { z } from 'zod';

export const verifyOtpSchema = z.object({
  email: z.string().email('Email tidak valid').toLowerCase().trim(),

  otp: z.string().regex(/^\d{6}$/, 'OTP harus 6 digit'),
});

export type VerifyDto = z.infer<typeof verifyOtpSchema>;
