const MAX_BODY_CHARS = 16 * 1024 * 1024
const MAX_URL_LENGTH = 2048
/** 大型 OpenAPI 文档下载与 response.text() 可能较慢，不宜过短 */
const FETCH_TIMEOUT_MS = 300_000

function inferImportFilename(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop()?.toLowerCase() ?? ''

  if (last.endsWith('.yaml') || last.endsWith('.yml')) {
    return last
  }

  if (last.endsWith('.json')) {
    return last
  }

  return 'openapi.json'
}

function assertSafeImportUrl(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http 或 https 链接')
  }

  if (url.username || url.password) {
    throw new Error('链接中不允许包含用户名或密码')
  }
}

export async function fetchImportDocumentFromUrl(
  urlString: string,
): Promise<{ content: string, filename: string }> {
  const trimmed = urlString.trim()

  if (!trimmed) {
    throw new Error('请填写文档地址')
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    throw new Error(`链接长度不能超过 ${MAX_URL_LENGTH} 字符`)
  }

  let url: URL

  try {
    url = new URL(trimmed)
  }
  catch {
    throw new Error('链接格式不正确')
  }

  assertSafeImportUrl(url)

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: [
          'application/json',
          'application/yaml',
          'text/yaml',
          'text/plain',
          '*/*',
        ].join(', '),
      },
    })

    if (!response.ok) {
      throw new Error(`拉取文档失败：HTTP ${response.status}`)
    }

    const lenHeader = response.headers.get('content-length')

    if (lenHeader) {
      const n = Number.parseInt(lenHeader, 10)

      if (Number.isFinite(n) && n > MAX_BODY_CHARS) {
        throw new Error('文档体积过大，请改用本地上传')
      }
    }

    const content = await response.text()

    if (content.length > MAX_BODY_CHARS) {
      throw new Error('文档体积过大，请改用本地上传')
    }

    if (!content.trim()) {
      throw new Error('文档内容为空')
    }

    return {
      content,
      filename: inferImportFilename(url),
    }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('拉取文档超时，请检查网络或稍后重试')
    }

    throw error
  }
  finally {
    clearTimeout(timer)
  }
}
