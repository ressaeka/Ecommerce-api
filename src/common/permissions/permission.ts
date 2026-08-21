export const PERMISSIONS = {
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  PROFILE_READ: 'profile:read',
  PROFILE_UPDATE: 'profile:update',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
