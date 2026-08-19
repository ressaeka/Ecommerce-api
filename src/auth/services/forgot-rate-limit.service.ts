import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service.js';

@Injectable()
export class ForgotRateLimitService {
  private readonly emailMaxAttempts = 3;
  private readonly ipMaxAttempts = 10;
  private readonly windowSeconds = 10 * 60;

  constructor(private readonly redisService: RedisService) {}

  async handleRequest(email: string, ip: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const emailKey = `forgot:email:${normalizedEmail}`;
    const ipKey = `forgot:ip:${ip}`;

    const [emailAttempts, ipAttempts] = await Promise.all([
      this.redisService.incrWithTtl(emailKey, this.windowSeconds),
      this.redisService.incrWithTtl(ipKey, this.windowSeconds),
    ]);

    if (
      emailAttempts > this.emailMaxAttempts ||
      ipAttempts > this.ipMaxAttempts
    ) {
      throw new HttpException(
        'Terlalu banyak permintaan reset password',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
