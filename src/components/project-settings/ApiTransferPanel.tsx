import { useMemo, useState } from 'react'

import { Button, Progress, Space, Typography, message, theme } from 'antd'
import { useLocation } from 'react-router'

import { useMenuHelpersContext } from '@/contexts/menu-helpers'

interface ImportPayload {
  ok: boolean
  error: string | null
}

interface UploadApiFileOptions {
  projectId: string
  file: File
  onProgress: (percent: number) => void
}

function resolveProjectId(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  return parts.at(0) === 'projects' ? parts.at(1) : undefined
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function pickImportFile(onSelect: (file: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.yaml,.yml'
  input.onchange = () => {
    const file = input.files?.item(0)

    if (file) {
      onSelect(file)
    }
  }
  input.click()
}

function uploadApiFile(props: UploadApiFileOptions) {
  const { projectId, file, onProgress } = props

  return new Promise<ImportPayload>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    xhr.open('POST', `/api/v1/projects/${projectId}/imports`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return
      }

      const percent = Math.min(99, Math.round((event.loaded / event.total) * 100))
      onProgress(percent)
    }
    xhr.onerror = () => {
      reject(new Error('网络异常，请稍后重试'))
    }
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText) as ImportPayload

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload)
          return
        }

        reject(new Error(payload.error ?? '导入失败'))
      }
      catch {
        reject(new Error('导入失败：服务端返回异常'))
      }
    }

    xhr.send(formData)
  })
}

export function ApiTransferPanel() {
  const { token } = theme.useToken()
  const { pathname } = useLocation()
  const { reloadState } = useMenuHelpersContext()
  const [msgApi, contextHolder] = message.useMessage()
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importFileName, setImportFileName] = useState<string>()

  const projectId = useMemo(() => resolveProjectId(pathname), [pathname])

  const handleExport = async (format: 'json' | 'yaml') => {
    if (!projectId) {
      msgApi.error('请在项目页面执行导出')
      return
    }

    const response = await fetch(`/api/v1/projects/${projectId}/openapi/export?format=${format}`, {
      method: 'GET',
      credentials: 'include',
    })

    if (!response.ok) {
      msgApi.error('导出失败')
      return
    }

    downloadFile(await response.blob(), `openapi.${format}`)
  }

  const handleImport = async (file: File) => {
    if (!projectId) {
      msgApi.error('请在项目页面执行导入')
      return
    }

    if (!window.confirm('导入将全量替换当前项目数据，是否继续？')) {
      return
    }

    setIsImporting(true)
    setImportProgress(0)
    setImportFileName(file.name)
    msgApi.open({ key: 'api-import', type: 'loading', content: '导入中 0%', duration: 0 })

    try {
      const payload = await uploadApiFile({
        projectId,
        file,
        onProgress: (percent) => {
          setImportProgress(percent)
          msgApi.open({
            key: 'api-import',
            type: 'loading',
            content: `导入中 ${percent}%`,
            duration: 0,
          })
        },
      })

      if (!payload.ok) {
        throw new Error(payload.error ?? '导入失败')
      }

      setImportProgress(100)
      msgApi.open({ key: 'api-import', type: 'success', content: '导入成功' })
      await reloadState()
    }
    catch (error) {
      msgApi.open({
        key: 'api-import',
        type: 'error',
        content: error instanceof Error ? error.message : '导入失败',
      })
    }
    finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {contextHolder}

      <section
        className="rounded-xl border border-solid p-5"
        style={{ borderColor: token.colorBorderSecondary, backgroundColor: token.colorFillAlter }}
      >
        <Typography.Title level={4}>导入接口</Typography.Title>
        <Typography.Paragraph type="secondary">
          支持导入 OpenAPI 3.x 的 JSON 或 YAML，以及 Postman Collection v2/v2.1 的 JSON 文件。
          导入后会直接替换当前项目里的接口、请求目录与模型数据。
        </Typography.Paragraph>
        <Typography.Paragraph className="!mb-4" type="danger">
          导入会覆盖当前项目数据，请先确认文件内容。
        </Typography.Paragraph>

        <Space direction="vertical" size={12}>
          <Button
            type="primary"
            loading={isImporting}
            disabled={isImporting}
            onClick={() => {
              pickImportFile((file) => {
                void handleImport(file)
              })
            }}
          >
            选择文件导入接口文档
          </Button>

          {isImporting && (
            <div className="w-full max-w-md">
              <div className="mb-1 text-xs" style={{ color: token.colorTextSecondary }}>
                正在导入：{importFileName ?? '接口文档文件'}
              </div>
              <Progress percent={importProgress} size="small" status="active" />
            </div>
          )}
        </Space>
      </section>

      <section
        className="rounded-xl border border-solid p-5"
        style={{ borderColor: token.colorBorderSecondary }}
      >
        <Typography.Title level={5}>导出 OpenAPI</Typography.Title>
        <Typography.Paragraph className="!mb-4" type="secondary">
          如果需要备份或迁移当前项目，也可以直接导出 OpenAPI 文档。
        </Typography.Paragraph>

        <Space wrap size={12}>
          <Button onClick={() => void handleExport('json')}>导出 OpenAPI JSON</Button>
          <Button onClick={() => void handleExport('yaml')}>导出 OpenAPI YAML</Button>
        </Space>
      </section>
    </div>
  )
}
