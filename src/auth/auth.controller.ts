import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { registerSchema, RegisterDto } from './dto/register.js';
import { loginSchema, LoginDto } from './dto/login.js';
import { RefreshTokenDto, refreshTokenSchema } from './dto/refresh.token.js';
import {
  ForgotPasswordDto,
  forgotPasswordSchema,
} from './dto/forgot.password.js';
import { VerifyDto, verifyOtpSchema } from './dto/verify.otp.js';
import { ResetPasswordDto, resetPasswordSchema } from './dto/reset.password.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerSchema))
    dto: RegisterDto,
  ) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginSchema))
    dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema))
    dto: RefreshTokenDto,
  ) {
    return this.authService.refresh(dto);
  }

  @Post('forgot')
  @HttpCode(HttpStatus.OK)
  forgot(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    dto: ForgotPasswordDto,
  ) {
    return this.authService.forgot(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema))
    dto: VerifyDto,
  ) {
    return this.authService.verifyOtp(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto);
  }
}
