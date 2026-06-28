import { getPrototypeRuntime } from '../../core/productAdapter'

const OSS_PREVIEW_PROCESS = 'x-oss-process=image/resize,w_240/quality,q_75'

interface OssConfig {
  bucket: string
  baseUrl: string
  accessKeyId: string
  accessKeySecret: string
}

function getOssConfig(): OssConfig | null {
  const config = getPrototypeRuntime().oss ?? {}
  const bucket = config.bucket?.trim() ?? ''
  const baseUrl = (config.baseUrl?.trim() ?? '').replace(/\/$/, '')
  const accessKeyId = config.accessKeyId?.trim() ?? ''
  const accessKeySecret = config.accessKeySecret?.trim() ?? ''
  if (!bucket || !baseUrl || !accessKeyId || !accessKeySecret) return null
  return { bucket, baseUrl, accessKeyId, accessKeySecret }
}

function toBase64(bytes: ArrayBuffer) {
  let binary = ''
  const array = new Uint8Array(bytes)
  array.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

async function signPolicy(policy: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(policy))
  return toBase64(signature)
}

function buildPolicy(objectKey: string, maxSize: number) {
  const expiration = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  return btoa(
    JSON.stringify({
      expiration,
      conditions: [
        ['content-length-range', 0, maxSize],
        ['starts-with', '$key', objectKey.split('/').slice(0, -1).join('/') + '/'],
        ['starts-with', '$Content-Type', 'image/'],
      ],
    }),
  )
}

export function ossUploadEnabled() {
  return Boolean(getOssConfig())
}

export function ossObjectUrl(objectKey: string) {
  const config = getOssConfig()
  if (!config) return ''
  return `${config.baseUrl}/${objectKey.split('/').map(encodeURIComponent).join('/')}`
}

export function ossPreviewUrl(url: string) {
  if (!url) return ''
  return `${url}${url.includes('?') ? '&' : '?'}${OSS_PREVIEW_PROCESS}`
}

export async function uploadImageToOss(objectKey: string, file: Blob) {
  const config = getOssConfig()
  if (!config) throw new Error('缺少 OSS 上传配置')
  const policy = buildPolicy(objectKey, file.size)
  const signature = await signPolicy(policy, config.accessKeySecret)
  const formData = new FormData()
  formData.set('key', objectKey)
  formData.set('policy', policy)
  formData.set('OSSAccessKeyId', config.accessKeyId)
  formData.set('signature', signature)
  formData.set('success_action_status', '201')
  formData.set('Content-Type', file.type || 'application/octet-stream')
  formData.set('file', file)

  const response = await fetch(config.baseUrl, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) throw new Error(`OSS 图片上传失败：${response.status}`)
  return {
    objectKey,
    url: ossObjectUrl(objectKey),
  }
}
