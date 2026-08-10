import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface SendOtpParams {
  to: string;
  otp: string;
  expiresInMinutes: number;
}

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(
      this.configService.getOrThrow<string>('RESEND_API_KEY'),
    );

    this.fromEmail = this.configService.getOrThrow<string>('MAIL_FROM');
  }

  async sendWelcomeEmail(email: string, username: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to: email,
      subject: 'Selamat Datang!',
      html: `
          <h2>Selamat datang, ${username}! 👋</h2>

          <p>
            Akun kamu berhasil dibuat.
          </p>

          <p>
            Terima kasih sudah bergabung.
          </p>
        `,
    });

    if (error) {
      console.error('Resend welcome email error:', error);

      throw new InternalServerErrorException('Gagal mengirim email');
    }
  }

  async sendResetPasswordOtp({
    to,
    otp,
    expiresInMinutes,
  }: SendOtpParams): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject: 'Reset Password OTP',
      html: `
          <h2>Reset Password</h2>

          <p>
            Kode OTP untuk reset password kamu:
          </p>

          <h1>${otp}</h1>

          <p>
            Kode ini berlaku selama
            <strong>
              ${expiresInMinutes} menit
            </strong>.
          </p>

          <p>
            Jika kamu tidak meminta reset password,
            abaikan email ini.
          </p>
        `,
    });

    if (error) {
      console.error('Resend reset password email error:', error);

      throw new InternalServerErrorException('Gagal mengirim email OTP');
    }
  }
}
