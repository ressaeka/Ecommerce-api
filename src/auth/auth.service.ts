import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { successResponse } from '../common/helpers/response.helper.js';
import { hashPassword, comparePassword } from '../common/helpers/bcrypt.js';
import { RegisterDto } from './dto/register.js';
import { LoginDto } from './dto/login.js';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async register(dto: RegisterDto) {
    const hashedPassword = await hashPassword(dto.password);

    const user = await this.usersService.createUser({
      ...dto,
      password: hashedPassword,
    });

    return successResponse(user, 'User berhasil didaftarkan');
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findCredentialsByUsername(
      dto.username,
    );

    if (!user) {
      throw new UnauthorizedException('Username atau password salah');
    }

    const isMatch = await comparePassword(dto.password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Username atau password salah');
    }

    return successResponse(
      {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      'Login berhasil',
    );
  }
}
