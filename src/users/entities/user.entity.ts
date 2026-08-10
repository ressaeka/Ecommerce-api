import { Role } from '../../../generated/prisma/enums.js';

export class User {
  password(password: string, password1: any) {
    throw new Error('Method not implemented.');
  }
  id!: number;
  name!: string;
  username!: string;
  email!: string;
  role!: Role;
  createdAt!: Date;
}
