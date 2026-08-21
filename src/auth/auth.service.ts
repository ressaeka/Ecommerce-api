import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
import { LoginRateLimitService } from './services/login-rate-limit.service.js';
import { ForgotRateLimitService } from './services/forgot-rate-limit.service.js';
import { OtpRateLimitService } from './services/otp-rate-limit.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    private readonly loginRateLimitService: LoginRateLimitService,
    private readonly forgotRateLimitService: ForgotRateLimitService,
    private readonly otpRateLimitService: OtpRateLimitService,
  ) {}

  async register(dto: RegisterDto) {
    const hashedPassword = await hashPassword(dto.password);

    const user = await this.usersService.createUser({
      ...dto,
      password: hashedPassword,
    });

    /*
     * Email dikirim secara non-blocking.
     *
     * Kalau email gagal dikirim, registrasi tetap sukses
     * dan error hanya dicatat di log.
     */
    void this.mailService
      .sendWelcomeEmail(user.email, user.username)
      .catch((error) => {
        this.logger.error(
          `Welcome email gagal dikirim: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

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

      throw new UnauthorizedException('Username atau password salah');
    }

    const isPasswordValid = await comparePassword(dto.password, user.password);

    if (!isPasswordValid) {
      await this.loginRateLimitService.handleFailure(dto.username, ip);

      throw new UnauthorizedException('Username atau password salah');
    }

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
       * Revoke refresh token lama secara atomik.
       *
       * Kalau sudah ada request lain yang meng-claim
       * (SET NX gagal), anggap ini reuse/race
       * dan revoke seluruh family.
       */
      const claimed = await this.redisService.setIfNotExists(
        oldKey,
        `revoked:${user.id}`,
        7 * 24 * 60 * 60,
      );

      if (!claimed) {
        await this.redisService.set(
          familyKey,
          `revoked:${payload.sub}`,
          7 * 24 * 60 * 60,
        );

        throw new UnauthorizedException('Refresh token reuse detected');
      }

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

  async forgot(dto: ForgotPasswordDto, ip: string) {
    await this.forgotRateLimitService.handleRequest(dto.email, ip);

    const user = await this.usersService.findByEmail(dto.email);

    /*
     * Kalau user tidak ada, tetap response sukses
     * untuk mencegah account enumeration.
     */
    if (user) {
      const otp = randomInt(100000, 1000000).toString();

      const hashedOtp = await hashPassword(otp);

      const expiresInMinutes = 10;
      const ttl = expiresInMinutes * 60;

      const otpKey = `otp:${user.email}`;

      await this.otpRateLimitService.reset(user.email);

      await this.redisService.set(otpKey, hashedOtp, ttl);

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

  async verifyOtp(dto: VerifyDto, ip: string) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('OTP tidak valid atau sudah kadaluarsa');
    }

    const otpKey = `otp:${user.email}`;

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
     *
     * Hit rate limiter (email + IP).
     */
    if (!isOtpValid) {
      await this.otpRateLimitService.handleAttempt(user.email, ip);

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
    await this.otpRateLimitService.reset(user.email);

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
      await this.usersService.updatePassword(user.id, hashedPassword);

      /*
       * Password berubah = semua session lama tidak valid.
       */
      await this.revokeAllUserSessions(user.id);

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

  /*
   * Hapus semua session user (family + refresh token).
   */
  private async revokeAllUserSessions(userId: number): Promise<void> {
    const [familyKeys, refreshKeys] = await Promise.all([
      this.redisService.scanKeys('family:*'),
      this.redisService.scanKeys('refresh:*'),
    ]);

    for (const key of familyKeys) {
      const value = await this.redisService.get(key);

      if (value && value.endsWith(`:${userId}`)) {
        await this.redisService.del(key);
      }
    }

    for (const key of refreshKeys) {
      const value = await this.redisService.get(key);

      if (value && value.includes(`:${userId}:`)) {
        await this.redisService.del(key);
      }
    }
  }
}
