const DEFAULT_AUTH_REDIRECT_PATH = '/projects'

export function resolveAuthRedirectTarget(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_AUTH_REDIRECT_PATH
  }

  return value
}
