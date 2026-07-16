import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { FormField } from '../../../shared/components/FormField'
import { useAuthStore } from '../../../store/authStore'
import type { LoginFieldErrors, LoginFormValues } from '../types/auth.types'

const initialValues: LoginFormValues = {
  username: '',
  password: '',
}

const validateForm = (values: LoginFormValues): LoginFieldErrors => {
  const errors: LoginFieldErrors = {}

  if (!values.username.trim()) {
    errors.username = 'Username is required.'
  }

  if (!values.password.trim()) {
    errors.password = 'Password is required.'
  }

  return errors
}

export function LoginForm() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const error = useAuthStore((state) => state.error)
  const status = useAuthStore((state) => state.status)
  const clearError = useAuthStore((state) => state.clearError)

  const [values, setValues] = useState<LoginFormValues>(initialValues)
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target

    setValues((currentValues) => ({ ...currentValues, [name]: value }))
    setFieldErrors((currentErrors) => ({ ...currentErrors, [name]: undefined }))

    if (error) clearError()
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors = validateForm(values)
    setFieldErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) return

    const didLogin = await login(values)

    if (didLogin) {
      navigate('/dashboard', { replace: true })
    }
  }

  const isSubmitting = status === 'loading'

  return (
    <form
      className="bg-white rounded-2xl border border-slate-200/80 shadow-elevated p-6 grid gap-5"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
        <p className="text-sm text-slate-400 mt-0.5">Enter your ERPNext credentials</p>
      </div>

      <div className="grid gap-4">
        <FormField
          autoComplete="username"
          error={fieldErrors.username}
          hint="Same username you use in ERPNext."
          label="Username"
          name="username"
          onChange={handleChange}
          placeholder="Enter your username"
          required
          value={values.username}
        />

        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-slate-600" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              autoComplete="current-password"
              className={`w-full px-3.5 py-2.5 pr-10 bg-white border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                fieldErrors.password
                  ? 'border-rose-300 focus:ring-rose-100 focus:border-rose-400'
                  : 'border-slate-200 focus:ring-indigo-100 focus:border-indigo-400'
              }`}
              id="password"
              name="password"
              onChange={handleChange}
              placeholder="Enter your password"
              required
              type={showPassword ? 'text' : 'password'}
              value={values.password}
            />
            <button
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 transition-colors"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              type="button"
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M1 1l22 22" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {fieldErrors.password ? (
            <span className="text-xs text-rose-600">{fieldErrors.password}</span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          aria-live="polite"
          className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-lg"
          role="alert"
        >
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 7a.875.875 0 1 1 0-1.75.875.875 0 0 1 0 1.75z" />
          </svg>
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      <button
        className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-lg py-2.5 font-semibold text-sm transition-colors active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none shadow-brand"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Signing in…
          </span>
        ) : (
          'Sign in'
        )}
      </button>
    </form>
  )
}
