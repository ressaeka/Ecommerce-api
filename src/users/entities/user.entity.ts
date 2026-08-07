import { Role } from '../../../generated/prisma/enums.js';

export class User {
  id!: number;
  name!: string;
  username!: string;
  email!: string;
  role!: Role;
  createdAt!: Date;
}
