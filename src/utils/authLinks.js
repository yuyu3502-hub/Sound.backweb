function normalizeInternalReturnTo(value) {
  if (typeof value !== 'string') return '';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/auth')) return '';
  return value;
}

export function buildAuthPath({ mode = 'register', returnTo = '' } = {}) {
  const params = new URLSearchParams();
  params.set('mode', mode === 'login' ? 'login' : 'register');

  const normalizedReturnTo = normalizeInternalReturnTo(returnTo);
  if (normalizedReturnTo) {
    params.set('returnTo', normalizedReturnTo);
  }

  return `/auth?${params.toString()}`;
}
