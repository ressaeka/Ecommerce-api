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
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { PERMISSIONS } from '../common/permissions/permission.js';
import { updateUserSchema, UpdateUserDto } from './dto/update-user.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { queryUsersSchema, QueryUsersDto } from './dto/query-users.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuthenticatedUser } from './entities/authenticated-user.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.PROFILE_READ)
  async findMe(@CurrentUser() user: AuthenticatedUser) {
    const identity = await this.usersService.findById(user.id);

    return successResponse(identity, 'Profil berhasil diambil');
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PERMISSIONS.PROFILE_UPDATE)
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,

    @Body(new ZodValidationPipe(updateUserSchema))
    updateUserDto: UpdateUserDto,
  ) {
    const identity = await this.usersService.update(user.id, updateUserDto);

    return successResponse(identity, 'Profil berhasil diperbarui');
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteMe(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.usersService.remove(user.id);

    return successResponse(result, 'Akun berhasil dihapus');
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions(PERMISSIONS.USER_READ)
  async findById(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findById(id);

    return successResponse(user, 'User berhasil diambil');
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions(PERMISSIONS.USER_READ)
  async findAll(
    @Query(new ZodValidationPipe(queryUsersSchema))
    query: QueryUsersDto,
  ) {
    const users = await this.usersService.findAll(query);

    return successResponse(users, 'Users berhasil diambil');
  }
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions(PERMISSIONS.USER_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,

    @Body(new ZodValidationPipe(updateUserSchema))
    updateUserDto: UpdateUserDto,
  ) {
    const user = await this.usersService.update(id, updateUserDto);

    return successResponse(user, 'User berhasil diupdate');
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Roles('ADMIN')
  @Permissions(PERMISSIONS.USER_DELETE)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const result = await this.usersService.remove(id);

    return successResponse(result, 'User berhasil dihapus');
  }
}
