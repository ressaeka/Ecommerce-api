import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { UpdateUserDto } from './dto/update-user.dto.js';
import { QueryUsersDto } from './dto/query-users.dto.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updatePassword(id: number, hashedPassword: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id },
        data: {
          password: hashedPassword,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`User ${id} tidak ditemukan`);
      }

      throw error;
    }
  }

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

    const user = await this.prisma.user.create({
      data,
    });

    return this.toEntity(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    return user ? this.toEntity(user) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    return user ? this.toEntity(user) : null;
  }

  /*
   * Dipakai AuthService untuk login.
   *
   * Password hash ikut diambil karena
   * AuthService membutuhkan password untuk compare.
   */
  async findByUsernameWithPassword(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async findById(id: number): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} tidak ditemukan`);
    }

    return this.toEntity(user);
  }

  async findAll(query: QueryUsersDto) {
    const { page, limit, search } = query;

    /*
     * Contoh:
     *
     * page = 1, limit = 10
     * skip = 0
     *
     * page = 2, limit = 10
     * skip = 10
     *
     * page = 3, limit = 10
     * skip = 20
     */
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    /*
     * Query data dan total dilakukan secara paralel.
     */
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,

        skip,
        take: limit,

        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => this.toEntity(user)),

      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const data: Prisma.UserUpdateInput = {
      ...updateUserDto,
    };

    /*
     * Cek duplikat username/email sebelum update.
     */
    if (updateUserDto.username || updateUserDto.email) {
      const or: Prisma.UserWhereInput[] = [];

      if (updateUserDto.username) {
        or.push({ username: updateUserDto.username });
      }

      if (updateUserDto.email) {
        or.push({ email: updateUserDto.email });
      }

      const existing = await this.prisma.user.findFirst({
        where: {
          NOT: { id },
          OR: or,
        },
      });

      if (existing) {
        const field =
          existing.username === updateUserDto.username ? 'username' : 'email';

        throw new ConflictException(`${field} sudah terdaftar`);
      }
    }

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
      });

      return this.toEntity(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`User ${id} tidak ditemukan`);
      }

      throw error;
    }
  }

  async remove(id: number) {
    try {
      await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`User ${id} tidak ditemukan`);
      }

      throw error;
    }

    return {
      message: `User ${id} dihapus`,
    };
  }

  private toEntity(user: {
    id: number;
    name: string;
    username: string;
    email: string;
    role: 'USER' | 'ADMIN';
    createdAt: Date;
    updatedAt: Date;
  }): User {
    const entity = new User();

    entity.id = user.id;
    entity.name = user.name;
    entity.username = user.username;
    entity.email = user.email;
    entity.role = user.role;
    entity.createdAt = user.createdAt;
    entity.updatedAt = user.updatedAt;

    return entity;
  }
}
