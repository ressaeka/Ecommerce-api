import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEYS } from '../decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../users/entities/authenticated-user.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEYS,
      [context.getHandler(), context.getClass()],
    );

    /*
     * Endpoint tidak membutuhkan role khusus.
     */
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;

    /*
     * JWT Guard seharusnya sudah memastikan user ada.
     * Kalau tidak ada, jangan dianggap authorized.
     */
    if (!user) {
      throw new ForbiddenException('User tidak memiliki akses');
    }

    /*
     * Cek apakah role user termasuk
     * role yang diperbolehkan.
     */
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Anda tidak memiliki akses');
    }

    return true;
  }
}
