import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { JwtPayload } from '../../auth/strategies/jwt.strategy.js';
import { AuthenticatedUser } from '../../users/entities/authenticated-user.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const payload = ctx.switchToHttp().getRequest<{
      user: JwtPayload;
    }>().user;

    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  },
);
