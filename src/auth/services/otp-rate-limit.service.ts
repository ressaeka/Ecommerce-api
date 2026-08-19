import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service.js';

@Injectable()
export class OtpRateLimitService {
  private readonly emailMaxAttempts = 5;
  private readonly ipMaxAttempts = 20;
  private readonly windowSeconds = 10 * 60;

  constructor(private readonly redisService: RedisService) {}

  async handleAttempt(email: string, ip: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const emailKey = `otp-rate:email:${normalizedEmail}`;
    const ipKey = `otp-rate:ip:${ip}`;

    const [emailAttempts, ipAttempts] = await Promise.all([
      this.redisService.incrWithTtl(emailKey, this.windowSeconds),
      this.redisService.incrWithTtl(ipKey, this.windowSeconds),
    ]);

    if (
      emailAttempts >= this.emailMaxAttempts ||
      ipAttempts >= this.ipMaxAttempts
    ) {
      throw new HttpException(
        'Terlalu banyak percobaan OTP',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async reset(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const emailKey = `otp-rate:email:${normalizedEmail}`;

    await this.redisService.del(emailKey);
  }
}
