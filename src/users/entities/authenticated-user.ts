import { Role } from '../../../generated/prisma/enums.js';

export class AuthenticatedUser {
  id!: number;
  username!: string;
  role!: Role;
}
