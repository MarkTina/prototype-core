export interface PrototypeVersionManifest {
  version: string
  builtAt?: string
}

export function normalizeVersionManifest(value: unknown): PrototypeVersionManifest | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const version = typeof raw.version === 'string' ? raw.version.trim() : ''
  if (!version) return null
  const builtAt = typeof raw.builtAt === 'string' ? raw.builtAt.trim() : ''
  return { version, ...(builtAt ? { builtAt } : {}) }
}

export function shouldNotifyVersion(currentVersion: string, remoteVersion: string, dismissedVersion = '') {
  return Boolean(currentVersion && remoteVersion && currentVersion !== remoteVersion && remoteVersion !== dismissedVersion)
}

export function createVersionManifestUrl(baseUrl: string, manifestUrl: string | undefined, origin: string, timestamp: number) {
  const normalizedBase = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, origin)
  const url = new URL(manifestUrl?.trim() || 'version.json', normalizedBase)
  url.searchParams.set('ts', String(timestamp))
  return url
}
