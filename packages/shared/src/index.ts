export type UserRole = 'SUBMITTER' | 'REVIEWER' | 'ADMIN';
export type RegistrationRole = Exclude<UserRole, 'ADMIN'>;

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export interface AdminUser extends AuthUser {
  createdAt: string;
}
