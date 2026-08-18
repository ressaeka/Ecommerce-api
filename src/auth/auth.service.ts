import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt, randomUUID } from 'crypto';

import { UsersService } from '../users/users.service.js';
import { successResponse } from '../common/helpers/response.helper.js';

import {
  comparePassword,
  hashPassword,
} from '../common/helpers/password.helper.js';

import { type RegisterDto } from './dto/register.js';
import { type LoginDto } from './dto/login.js';
import { type RefreshTokenDto } from './dto/refresh.token.js';
import { type ForgotPasswordDto } from './dto/forgot.password.js';
import { type VerifyDto } from './dto/verify.otp.js';
import { type ResetPasswordDto } from './dto/reset.password.js';

import { RedisService } from '../common/redis/redis.service.js';
import { MailService } from '../common/mail/mail.service.js';
import { LoginRateLimitService } from '../common/helpers/rate-limit.helper.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    private readonly loginRateLimitService: LoginRateLimitService,
  ) {}

  async register(dto: RegisterDto) {
    const hashedPassword = await hashPassword(dto.password);

    const user = await this.usersService.createUser({
      ...dto,
      password: hashedPassword,
    });

    await this.mailService.sendWelcomeEmail(user.email, user.username);

    return successResponse(user, 'User berhasil didaftarkan');
  }

  async login(dto: LoginDto, ip: string) {
    const user = await this.usersService.findByUsernameWithPassword(
      dto.username,
    );

    /*
     * User tidak ditemukan.
     *
     * Tetap hit rate limiter supaya attacker
     * tidak bisa mencoba username tanpa batas.
     */
    if (!user) {
      await this.loginRateLimitService.handleFailure(dto.username, ip);

      /*
       * Guard untuk memastikan flow berhenti
       * dan TypeScript mengetahui bahwa user
       * tidak mungkin null setelah blok ini.
       */
      return;
    }

    /*
     * Password validation.
     */
    const isPasswordValid = await comparePassword(dto.password, user.password);

    /*
     * Password salah.
     */
    if (!isPasswordValid) {
      await this.loginRateLimitService.handleFailure(dto.username, ip);
    }

    /*
     * Login berhasil.
     *
     * Hanya reset counter username.
     * Counter IP tetap dibiarkan sampai TTL habis.
     */
    await this.loginRateLimitService.resetUsername(dto.username);

    /*
     * Access Token
     */
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    /*
     * Refresh Token Family
     */
    const familyId = randomUUID();

    /*
     * Unique JTI untuk refresh token.
     */
    const refreshTokenJti = randomUUID();

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        jti: refreshTokenJti,
        familyId,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
    );

    const ttl = 7 * 24 * 60 * 60;

    /*
     * Simpan session/family.
     */
    await this.redisService.set(`family:${familyId}`, `active:${user.id}`, ttl);

    /*
     * Simpan refresh token.
     */
    await this.redisService.set(
      `refresh:${refreshTokenJti}`,
      `active:${user.id}:${familyId}`,
      ttl,
    );

    return successResponse(
      {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        access_token: accessToken,
        refresh_token: refreshToken,
      },
      'Login berhasil',
    );
  }
  async refresh(dto: RefreshTokenDto) {
    try {
      /*
       * Verify signature dan expiration refresh token.
       */
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        jti: string;
        familyId: string;
      }>(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      /*
       * Pastikan claim security tersedia.
       */
      if (!payload.jti || !payload.familyId) {
        throw new UnauthorizedException('Refresh token tidak valid');
      }

      const familyKey = `family:${payload.familyId}`;

      /*
       * Ambil status session/family.
       */
      const family = await this.redisService.get(familyKey);

      if (!family) {
        throw new UnauthorizedException(
          'Session tidak valid atau sudah kadaluarsa',
        );
      }

      /*
       * Kalau family sudah revoked,
       * semua refresh token dalam family tersebut invalid.
       */
      if (family.startsWith('revoked:')) {
        throw new UnauthorizedException('Session sudah dicabut');
      }

      const oldKey = `refresh:${payload.jti}`;

      /*
       * Cek apakah refresh token masih active.
       */
      const session = await this.redisService.get(oldKey);

      if (!session) {
        throw new UnauthorizedException(
          'Refresh token tidak valid atau sudah kadaluarsa',
        );
      }

      /*
       * Kalau token lama sudah revoked,
       * berarti terjadi refresh-token reuse.
       */
      if (session.startsWith('revoked:')) {
        /*
         * Reuse detection:
         *
         * Kalau attacker menggunakan refresh token lama,
         * seluruh family kita revoke.
         */
        await this.redisService.set(
          familyKey,
          `revoked:${payload.sub}`,
          7 * 24 * 60 * 60,
        );

        throw new UnauthorizedException('Refresh token reuse detected');
      }

      /*
       * Pastikan user masih ada.
       */
      const user = await this.usersService.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User tidak ditemukan');
      }

      /*
       * Revoke refresh token lama.
       */
      await this.redisService.set(
        oldKey,
        `revoked:${user.id}`,
        7 * 24 * 60 * 60,
      );

      /*
       * Generate access token baru.
       */
      const newAccessToken = await this.jwtService.signAsync(
        {
          sub: user.id,
          username: user.username,
          role: user.role,
        },
        {
          secret: this.configService.getOrThrow<string>('JWT_SECRET'),
          expiresIn: '15m',
        },
      );

      /*
       * Generate JTI baru.
       */
      const newJti = randomUUID();

      /*
       * Generate refresh token baru.
       *
       * Family ID tetap sama.
       */
      const newRefreshToken = await this.jwtService.signAsync(
        {
          sub: user.id,
          jti: newJti,
          familyId: payload.familyId,
        },
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      );

      /*
       * Simpan refresh token baru sebagai active.
       */
      await this.redisService.set(
        `refresh:${newJti}`,
        `active:${user.id}:${payload.familyId}`,
        7 * 24 * 60 * 60,
      );

      return successResponse(
        {
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
        },
        'Token berhasil diperbarui',
      );
    } catch (error) {
      /*
       * Jangan bungkus ulang UnauthorizedException.
       */
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      /*
       * Semua error JWT/verification lainnya
       * dibuat menjadi response generic.
       */
      throw new UnauthorizedException(
        'Refresh token tidak valid atau sudah kadaluarsa',
      );
    }
  }

  async forgot(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    /*
     * Kalau user tidak ada, tetap response sukses
     * untuk mencegah user enumeration.
     */
    if (user) {
      /*
       * Generate cryptographically secure 6-digit OTP.
       */
      const otp = randomInt(100000, 1000000).toString();

      /*
       * Jangan simpan OTP plaintext di Redis.
       */
      const hashedOtp = await hashPassword(otp);

      const expiresInMinutes = 10;
      const ttl = expiresInMinutes * 60;

      const otpKey = `otp:${user.email}`;
      const attemptKey = `otp-attempts:${user.email}`;

      /*
       * OTP baru → reset jumlah attempt.
       */
      await this.redisService.del(attemptKey);

      /*
       * Simpan hash OTP selama 10 menit.
       */
      await this.redisService.set(otpKey, hashedOtp, ttl);

      /*
       * Kirim OTP melalui email.
       */
      await this.mailService.sendResetPasswordOtp({
        to: user.email,
        otp,
        expiresInMinutes,
      });
    }

    return successResponse(
      null,
      'Jika email terdaftar, OTP reset password akan dikirim',
    );
  }

  async verifyOtp(dto: VerifyDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('OTP tidak valid atau sudah kadaluarsa');
    }

    const otpKey = `otp:${user.email}`;
    const attemptKey = `otp-attempts:${user.email}`;

    /*
     * Ambil hash OTP dari Redis.
     */
    const storedOtp = await this.redisService.get(otpKey);

    if (!storedOtp) {
      throw new UnauthorizedException('OTP tidak valid atau sudah kadaluarsa');
    }

    /*
     * Compare OTP plaintext dengan hash.
     */
    const isOtpValid = await comparePassword(dto.otp.toString(), storedOtp);

    /*
     * OTP salah.
     */
    if (!isOtpValid) {
      const attempts = await this.redisService.incrWithTtl(attemptKey, 10 * 60);

      /*
       * Maximum 5 attempts.
       */
      if (attempts >= 5) {
        await this.redisService.del(otpKey);
        await this.redisService.del(attemptKey);

        throw new UnauthorizedException('Terlalu banyak percobaan OTP');
      }

      throw new UnauthorizedException('OTP tidak valid atau sudah kadaluarsa');
    }

    /*
     * OTP benar.
     *
     * Buat reset token.
     */
    const resetToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        purpose: 'password-reset',
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_RESET_SECRET'),
        expiresIn: '10m',
      },
    );

    /*
     * OTP bersifat single-use.
     */
    await this.redisService.del(otpKey);

    /*
     * Counter attempt juga dibersihkan.
     */
    await this.redisService.del(attemptKey);

    return successResponse(
      {
        resetToken,
      },
      'OTP berhasil diverifikasi',
    );
  }

  async resetPassword(dto: ResetPasswordDto) {
    try {
      /*
       * Verify reset token.
       */
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        purpose: string;
      }>(dto.resetToken, {
        secret: this.configService.getOrThrow<string>('JWT_RESET_SECRET'),
      });

      /*
       * Pastikan token memang dibuat
       * khusus untuk password reset.
       */
      if (payload.purpose !== 'password-reset') {
        throw new UnauthorizedException('Reset token tidak valid');
      }

      /*
       * Pastikan user masih ada.
       */
      const user = await this.usersService.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('Reset token tidak valid');
      }

      /*
       * Hash password baru.
       */
      const hashedPassword = await hashPassword(dto.newPassword);

      /*
       * Update password.
       */
      await this.usersService.update(user.id, {
        password: hashedPassword,
      });

      return successResponse(null, 'Password berhasil direset');
    } catch {
      /*
       * Jangan expose detail JWT error.
       */
      throw new UnauthorizedException(
        'Reset token tidak valid atau sudah kadaluarsa',
      );
    }
  }

  async logout(dto: RefreshTokenDto) {
    try {
      /*
       * Verify refresh token.
       */
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        jti: string;
        familyId: string;
      }>(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      if (!payload.jti || !payload.familyId) {
        throw new UnauthorizedException('Refresh token tidak valid');
      }

      const familyKey = `family:${payload.familyId}`;

      /*
       * Pastikan family/session masih ada.
       */
      const family = await this.redisService.get(familyKey);

      if (!family) {
        throw new UnauthorizedException(
          'Session tidak valid atau sudah kadaluarsa',
        );
      }

      /*
       * Revoke seluruh refresh-token family.
       */
      await this.redisService.set(
        familyKey,
        `revoked:${payload.sub}`,
        7 * 24 * 60 * 60,
      );

      return successResponse(null, 'Logout berhasil');
    } catch (error) {
      /*
       * Jangan bungkus ulang UnauthorizedException.
       */
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Refresh token tidak valid');
    }
  }
}
