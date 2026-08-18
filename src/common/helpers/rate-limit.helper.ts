import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class LoginRateLimitService {
  private readonly usernameMaxAttempts = 5;
  private readonly ipMaxAttempts = 20;
  private readonly windowSeconds = 60;

  constructor(private readonly redisService: RedisService) {}

  async handleFailure(username: string, ip: string): Promise<never> {
    const usernameKey = `login-attempts:${username.toLowerCase()}`;

    const ipKey = `login:ip:${ip}`;

    const [usernameAttempts, ipAttempts] = await Promise.all([
      this.redisService.incrWithTtl(usernameKey, this.windowSeconds),
      this.redisService.incrWithTtl(ipKey, this.windowSeconds),
    ]);

    if (
      usernameAttempts >= this.usernameMaxAttempts ||
      ipAttempts >= this.ipMaxAttempts
    ) {
      throw new HttpException(
        'Terlalu banyak percobaan login',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    throw new UnauthorizedException('Username atau password salah');
  }

  async resetUsername(username: string): Promise<void> {
    const usernameKey = `login-attempts:${username.toLowerCase()}`;

    await this.redisService.del(usernameKey);
  }
}
