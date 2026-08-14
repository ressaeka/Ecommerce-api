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
      subject: 'Selamat datang 👋',
      html: `
        <!DOCTYPE html>
        <html>
          <body
            style="
              margin: 0;
              padding: 0;
              background-color: #f4f6f8;
              font-family: Arial, Helvetica, sans-serif;
              color: #222;
            "
          >
            <div
              style="
                max-width: 600px;
                margin: 40px auto;
                background-color: #ffffff;
                border-radius: 12px;
                padding: 32px;
              "
            >
              <h2 style="margin-top: 0;">
                Selamat datang, ${username}! 👋
              </h2>

              <p>
                Akun kamu berhasil dibuat.
              </p>

              <p>
                Terima kasih sudah bergabung.
                Kami senang kamu menjadi bagian dari platform kami.
              </p>

              <p>
                Kamu sekarang sudah dapat menggunakan akunmu
                untuk mengakses layanan yang tersedia.
              </p>

              <hr
                style="
                  border: none;
                  border-top: 1px solid #eeeeee;
                  margin: 28px 0;
                "
              />

              <p
                style="
                  margin-bottom: 0;
                  color: #777;
                  font-size: 13px;
                "
              >
                Jika kamu tidak membuat akun ini, silakan hubungi
                tim support kami.
              </p>
            </div>
          </body>
        </html>
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
      subject: 'Kode OTP Reset Password',
      html: `
        <!DOCTYPE html>
        <html>
          <body
            style="
              margin: 0;
              padding: 0;
              background-color: #f4f6f8;
              font-family: Arial, Helvetica, sans-serif;
              color: #222;
            "
          >
            <div
              style="
                max-width: 600px;
                margin: 40px auto;
                background-color: #ffffff;
                border-radius: 12px;
                padding: 32px;
              "
            >

              <!-- Header -->
              <div style="text-align: center; margin-bottom: 32px;">
                <h2 style="margin: 0;">
                  Reset Password
                </h2>

                <p
                  style="
                    color: #666;
                    margin-top: 8px;
                  "
                >
                  Kami menerima permintaan untuk mengatur ulang
                  password akun kamu.
                </p>
              </div>

              <!-- OTP -->
              <div
                style="
                  text-align: center;
                  background-color: #f7f8fa;
                  border-radius: 10px;
                  padding: 24px;
                  margin: 24px 0;
                "
              >
                <p
                  style="
                    margin: 0 0 12px;
                    color: #666;
                    font-size: 14px;
                  "
                >
                  Kode verifikasi kamu
                </p>

                <div
                  style="
                    font-size: 36px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    color: #111;
                  "
                >
                  ${otp}
                </div>
              </div>

              <!-- Expiration -->
              <p>
                Kode ini hanya berlaku selama
                <strong>${expiresInMinutes} menit</strong>.
              </p>

              <p>
                Gunakan kode ini pada halaman reset password
                untuk melanjutkan proses.
              </p>

              <hr
                style="
                  border: none;
                  border-top: 1px solid #eeeeee;
                  margin: 28px 0;
                "
              />

              <!-- Security warning -->
              <h3>
                Demi keamanan akun kamu
              </h3>

              <ul
                style="
                  padding-left: 20px;
                  color: #555;
                  line-height: 1.6;
                "
              >
                <li>
                  Jangan pernah membagikan kode OTP kepada siapa pun.
                </li>

                <li>
                  Masukkan kode hanya pada aplikasi atau website resmi.
                </li>

                <li>
                  Jangan memberikan kode melalui chat, telepon,
                  atau email kepada orang lain.
                </li>
              </ul>

              <p
                style="
                  background-color: #fff8e1;
                  padding: 14px;
                  border-radius: 8px;
                  color: #665500;
                "
              >
                Jika kamu tidak meminta reset password,
                abaikan email ini dan pertimbangkan untuk
                mengamankan akun kamu.
              </p>

              <!-- Footer -->
              <hr
                style="
                  border: none;
                  border-top: 1px solid #eeeeee;
                  margin: 28px 0;
                "
              />

              <p
                style="
                  margin-bottom: 0;
                  color: #999;
                  font-size: 12px;
                  text-align: center;
                "
              >
                Email ini dikirim secara otomatis.
                Mohon jangan membalas email ini.
              </p>

            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Resend reset password email error:', error);

      throw new InternalServerErrorException('Gagal mengirim email OTP');
    }
  }
}
