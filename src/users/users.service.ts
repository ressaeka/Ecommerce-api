import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: data.username }, { email: data.email }],
      },
    });

    if (existing) {
      const field = existing.username === data.username ? 'username' : 'email';
      throw new ConflictException(`${field} sudah terdaftar`);
    }

    const user = await this.prisma.user.create({ data });

    return this.toEntity(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? this.toEntity(user) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    return user ? this.toEntity(user) : null;
  }

  async findCredentialsByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findById(id: number): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) throw new NotFoundException(`User ${id} tidak ditemukan`);

    return this.toEntity(user);
  }

  async findAll(): Promise<User[]> {
    const users = await this.prisma.user.findMany();
    return users.map((user) => this.toEntity(user));
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const data: Prisma.UserUpdateInput = { ...updateUserDto };

    const user = await this.prisma.user.update({ where: { id }, data });

    return this.toEntity(user);
  }

  async remove(id: number) {
    await this.prisma.user.delete({ where: { id } });
    return { message: `User ${id} dihapus` };
  }

  private toEntity(user: {
    id: number;
    name: string;
    username: string;
    email: string;
    role: 'USER' | 'ADMIN';
    createdAt: Date;
  }): User {
    const entity = new User();
    entity.id = user.id;
    entity.name = user.name;
    entity.username = user.username;
    entity.email = user.email;
    entity.role = user.role;
    entity.createdAt = user.createdAt;
    return entity;
  }
}
