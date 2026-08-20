import {
  Controller,
  Get,
  Patch,
  Param,
  Delete,
  Body,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { UsersService } from './users.service.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { successResponse } from '../common/helpers/response.helper.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { updateUserSchema, UpdateUserDto } from './dto/update-user.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { queryUsersSchema, QueryUsersDto } from './dto/query-users.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuthenticatedUser } from './entities/authenticated-user.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async findAll(
    @Query(new ZodValidationPipe(queryUsersSchema))
    query: QueryUsersDto,
  ) {
    const users = await this.usersService.findAll(query);

    return successResponse(users, 'Users berhasil diambil');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async findMe(@CurrentUser() user: AuthenticatedUser) {
    const identity = await this.usersService.findById(user.id);

    return successResponse(identity, 'Profil berhasil diambil');
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,

    @Body(new ZodValidationPipe(updateUserSchema))
    updateUserDto: UpdateUserDto,
  ) {
    const identity = await this.usersService.update(user.id, updateUserDto);

    return successResponse(identity, 'Profil berhasil diperbarui');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findById(id);

    return successResponse(user, 'User berhasil diambil');
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async update(
    @Param('id', ParseIntPipe) id: number,

    @Body(new ZodValidationPipe(updateUserSchema))
    updateUserDto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, updateUserDto);

    return successResponse(user, 'User berhasil diupdate');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const result = await this.usersService.remove(id);

    return successResponse(result, 'User berhasil dihapus');
  }
}
