import { Body, Controller, Post } from '@nestjs/common';

import { AuthService } from './auth.service.js';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';

import { registerSchema, RegisterDto } from './dto/register.js';

import { loginSchema, LoginDto } from './dto/login.js';

import { RefreshTokenDto, refreshTokenSchema } from './dto/refresh.token.js';

import {
  ForgotPasswordDto,
  forgotPasswordSchema,
} from './dto/forgot.password.js';

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
  login(
    @Body(new ZodValidationPipe(loginSchema))
    dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema))
    dto: RefreshTokenDto,
  ) {
    return this.authService.refresh(dto);
  }

  @Post('forgot')
  forgot(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    dto: ForgotPasswordDto,
  ) {
    return this.authService.forgot(dto);
  }
}
