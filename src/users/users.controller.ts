import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Delete,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { successResponse } from '../common/helpers/response.helper.js';
import { createUserSchema, CreateUserDto } from './dto/create-user.dto.js';
import { updateUserSchema, UpdateUserDto } from './dto/update-user.dto.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) createUserDto: CreateUserDto,
  ) {
    const user = await this.usersService.createUser(createUserDto);
    return successResponse(user, 'User berhasil dibuat');
  }

  @Get()
  async findAll() {
    const users = await this.usersService.findAll();
    return successResponse(users, 'Users berhasil diambil');
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findById(id);
    return successResponse(user, 'User berhasil diambil');
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateUserSchema)) updateUserDto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, updateUserDto);
    return successResponse(user, 'User berhasil diupdate');
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const result = await this.usersService.remove(id);
    return successResponse(result, 'User berhasil dihapus');
  }
}
