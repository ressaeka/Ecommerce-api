import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../users/users.service.js';
import { successResponse } from '../common/helpers/response.helper.js';

import {
  hashPassword,
  comparePassword,
} from '../common/helpers/password.helper.js';

import { RegisterDto } from './dto/register.js';
import { LoginDto } from './dto/login.js';
import { RefreshTokenDto } from './dto/refresh.token.js';
import { ForgotPasswordDto } from './dto/forgot.password.js';
import { VerifyDto } from './dto/verify.otp.js';
import { ResetPasswordDto } from './dto/reset.password.js';

import { RedisService } from '../common/redis/redis.service.js';
import { MailService } from '../common/mail/mail.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
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

  async login(dto: LoginDto) {
    const user = await this.usersService.findByUsernameWithPassword(
      dto.username,
    );

    if (!user) {
      throw new UnauthorizedException('Username atau password salah');
    }

    const isPasswordValid = await comparePassword(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Username atau password salah');
    }

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

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      },
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
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
      }>(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User tidak ditemukan');
      }

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

      const newRefreshToken = await this.jwtService.signAsync(
        {
          sub: user.id,
        },
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      );

      return successResponse(
        {
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
        },
        'Token berhasil diperbarui',
      );
    } catch {
      throw new UnauthorizedException(
        'Refresh token tidak valid atau sudah kadaluarsa',
      );
    }
  }

  async forgot(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (user) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      const expiresInMinutes = 10;
      
      const key = `otp:${user.email}`;

      await this.redisService.set(
        key,
        otp,
        expiresInMinutes * 60,
      );

      console.log('OTP KEY:', key);
      console.log('OTP:', otp);

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

    const storedOtp = await this.redisService.get(`otp:${user.email}`);

    if (!storedOtp) {
      throw new UnauthorizedException('OTP tidak valid atau sudah kadaluarsa');
    }

    if (storedOtp !== dto.otp.toString()) {
      throw new UnauthorizedException('OTP tidak valid atau sudah kadaluarsa');
    }

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

    await this.redisService.del(`otp:${user.email}`);

    return successResponse({ resetToken }, 'OTP berhasil diverifikasi');
  }

  async resetPassword(dto: ResetPasswordDto) {
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        purpose: string;
      }>(dto.resetToken, {
        secret: this.configService.getOrThrow<string>('JWT_RESET_SECRET'),
      });

      if (payload.purpose !== 'password-reset') {
        throw new UnauthorizedException('Reset token tidak valid');
      }

      const user = await this.usersService.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('Reset token tidak valid');
      }

      const hashedPassword = await hashPassword(dto.newPassword);

      await this.usersService.update(user.id, {
        password: hashedPassword,
      });

      return successResponse(null, 'Password berhasil direset');
    } catch {
      throw new UnauthorizedException(
        'Reset token tidak valid atau sudah kadaluarsa',
      );
    }
  }
}
