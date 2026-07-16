export interface LoginCredentials {
  username: string
  password: string
}

export interface LoginFormValues extends LoginCredentials {}

export interface AuthUser {
  username: string
  fullName?: string
  loginId?: string
  roles?: string[]
  mobileNo?: string
  gender?: string
  dateOfBirth?: string // YYYY-MM-DD
}

export type LoginFieldErrors = Partial<Record<keyof LoginFormValues, string>>
