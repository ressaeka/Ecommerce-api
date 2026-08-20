export class AuthenticatedUser {
  id!: number;
  username!: string;
  role!: 'USER' | 'ADMIN';
}
