import { useEffect, useMemo, useRef, useState } from 'react'

import { Button, Input, List, Popconfirm, Progress, Select, Space, Tabs, Tag, Typography, message, theme } from 'antd'
import dayjs from 'dayjs'
import * as Y from 'yjs'

import { MarkdownEditor } from '@/components/MarkdownEditor'

interface SharedFileItem {
  id: string
  uploaderUserId: string
  uploaderUsername: string
  linkedDocId?: string
  name: string
  size: number
  mimeType: string
  createdAt: string
}

interface SharedDocItem {
  id: string
  creatorUserId: string
  creatorUsername: string
  docType: 'markdown' | 'excel'
  title: string
  content: string
  version: number
  createdAt: string
  updatedAt: string
}

type ExcelGrid = string[][]
interface PresenceMember {
  userId: string
  username: string
  isTyping: boolean
  lastSeenAt: number
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function pickFile(onSelect: (file: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.onchange = () => {
    const file = input.files?.item(0)

    if (file) {
      onSelect(file)
    }
  }
  input.click()
}

function uint8ToBase64(data: Uint8Array) {
  let raw = ''

  data.forEach((byte) => {
    raw += String.fromCharCode(byte)
  })

  return btoa(raw)
}

function base64ToUint8(base64: string) {
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)

  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i)
  }

  return bytes
}

export function SharedWorkspacePanel(props: { projectId?: string, editable: boolean }) {
  const { projectId, editable } = props
  const { token } = theme.useToken()
  const [msgApi, contextHolder] = message.useMessage()
  const [files, setFiles] = useState<SharedFileItem[]>([])
  const [docs, setDocs] = useState<SharedDocItem[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [dragOverUploadZone, setDragOverUploadZone] = useState(false)
  const [activeDocId, setActiveDocId] = useState<string>()
  const [docTitle, setDocTitle] = useState('')
  const [docContent, setDocContent] = useState('')
  const [docVersion, setDocVersion] = useState(0)
  const [creatingDocTitle, setCreatingDocTitle] = useState('')
  const [creatingDocType, setCreatingDocType] = useState<'markdown' | 'excel'>('markdown')
  const [presenceMembers, setPresenceMembers] = useState<PresenceMember[]>([])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle')
  const yDocRef = useRef<Y.Doc>()
  const pollTimerRef = useRef<number>()
  const pushTimerRef = useRef<number>()
  const excelSyncTimerRef = useRef<number>()
  const saveTimerRef = useRef<number>()
  const presenceTimerRef = useRef<number>()
  const typingTimerRef = useRef<number>()
  const typingActiveRef = useRef(false)
  const remoteApplyingRef = useRef(false)
  const docVersionRef = useRef(0)

  const activeDoc = useMemo(() => docs.find((doc) => doc.id === activeDocId), [docs, activeDocId])

  useEffect(() => {
    docVersionRef.current = docVersion
  }, [docVersion])

  const excelGrid = useMemo(() => {
    if (!activeDoc || activeDoc.docType !== 'excel') {
      return [['']]
    }

    try {
      const parsed = JSON.parse(docContent || '[]') as ExcelGrid

      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [['']]
      }

      return parsed.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : [''])
    }
    catch {
      return [['']]
    }
  }, [activeDoc, docContent])

  const setExcelCell = (rowIndex: number, colIndex: number, value: string) => {
    const next = excelGrid.map((row) => [...row])
    next[rowIndex] ??= []
    next[rowIndex][colIndex] = value
    typingActiveRef.current = true
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current)
    }
    typingTimerRef.current = window.setTimeout(() => {
      typingActiveRef.current = false
    }, 1200)
    setDocContent(JSON.stringify(next))
  }

  const appendExcelRow = () => {
    const colCount = Math.max(...excelGrid.map((row) => row.length), 1)
    const nextRow = new Array(colCount).fill('')
    typingActiveRef.current = true
    setDocContent(JSON.stringify([...excelGrid, nextRow]))
  }

  const appendExcelColumn = () => {
    const next = excelGrid.map((row) => [...row, ''])
    typingActiveRef.current = true
    setDocContent(JSON.stringify(next))
  }

  const fetchFiles = async () => {
    if (!projectId) {
      return
    }

    setLoadingFiles(true)

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/shared-files`, { credentials: 'include' })
      const payload = await response.json() as { ok: boolean, data?: { files: SharedFileItem[] }, error: string | null }

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? '加载共享文件失败')
      }

      setFiles(payload.data.files)
    }
    catch (error) {
      msgApi.error(error instanceof Error ? error.message : '加载共享文件失败')
    }
    finally {
      setLoadingFiles(false)
    }
  }

  const fetchDocs = async () => {
    if (!projectId) {
      return
    }

    setLoadingDocs(true)

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/shared-docs`, { credentials: 'include' })
      const payload = await response.json() as { ok: boolean, data?: { docs: SharedDocItem[] }, error: string | null }

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? '加载在线文档失败')
      }

      setDocs(payload.data.docs)
      setActiveDocId((current) => current ?? payload.data?.docs[0]?.id)
    }
    catch (error) {
      msgApi.error(error instanceof Error ? error.message : '加载在线文档失败')
    }
    finally {
      setLoadingDocs(false)
    }
  }

  const pushPresence = async (isTyping: boolean) => {
    if (!projectId || !activeDocId) {
      return
    }

    await fetch(`/api/v1/projects/${projectId}/shared-docs/${activeDocId}/presence`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTyping }),
    })
  }

  const fetchPresence = async () => {
    if (!projectId || !activeDocId) {
      return
    }

    const response = await fetch(`/api/v1/projects/${projectId}/shared-docs/${activeDocId}/presence`, {
      credentials: 'include',
    })
    const payload = await response.json() as {
      ok: boolean
      data?: { members: PresenceMember[] }
    }

    if (!payload.ok || !payload.data) {
      return
    }

    setPresenceMembers(payload.data.members)
  }

  const saveDocDraft = async () => {
    if (!projectId || !activeDoc) {
      return
    }

    setSaveStatus('saving')
    const response = await fetch(`/api/v1/projects/${projectId}/shared-docs/${activeDoc.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: docTitle,
        content: docContent,
        baseVersion: docVersion,
      }),
    })
    const payload = await response.json() as {
      ok: boolean
      data?: { doc: SharedDocItem }
      error: string | null
    }

    if (response.status === 409) {
      setSaveStatus('conflict')
      msgApi.warning(payload.error ?? '文档有冲突，请等待同步后重试')
      return
    }

    if (!response.ok || !payload.ok || !payload.data) {
      setSaveStatus('error')
      msgApi.error(payload.error ?? '自动保存失败')
      return
    }

    setDocVersion(payload.data.doc.version)
    setSaveStatus('saved')
  }

  useEffect(() => {
    void fetchFiles()
    void fetchDocs()
  }, [projectId])

  useEffect(() => {
    if (!activeDoc) {
      yDocRef.current?.destroy()
      yDocRef.current = undefined
      return
    }

    if (activeDoc.docType !== 'markdown') {
      yDocRef.current?.destroy()
      yDocRef.current = undefined
      setDocTitle(activeDoc.title)
      setDocContent(activeDoc.content)
      setDocVersion(activeDoc.version)
      setSaveStatus('saved')
      return
    }

    const doc = new Y.Doc()
    const text = doc.getText('content')
    text.insert(0, activeDoc.content)
    yDocRef.current = doc
    setDocTitle(activeDoc.title)
    setDocContent(activeDoc.content)
    setDocVersion(activeDoc.version)
    setSaveStatus('saved')

    const observer = () => {
      if (remoteApplyingRef.current) {
        return
      }

      setDocContent(doc.getText('content').toString())

      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current)
      }

      pushTimerRef.current = window.setTimeout(async () => {
        if (!projectId || !activeDoc.id) {
          return
        }

        const update = Y.encodeStateAsUpdate(doc)
        const updateBase64 = uint8ToBase64(update)

        const response = await fetch(`/api/v1/projects/${projectId}/shared-docs/${activeDoc.id}/collab`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updateBase64 }),
        })
        const payload = await response.json() as {
          ok: boolean
          data?: { collab: { version: number, stateBase64: string, content: string } }
          error: string | null
        }

        if (!response.ok || !payload.ok || !payload.data) {
          msgApi.error(payload.error ?? '实时协同同步失败')
          return
        }

        setDocVersion(payload.data.collab.version)
      }, 450)
    }

    text.observe(observer)

    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current)
    }

    pollTimerRef.current = window.setInterval(async () => {
      if (!projectId || !activeDoc.id) {
        return
      }

      const response = await fetch(`/api/v1/projects/${projectId}/shared-docs/${activeDoc.id}/collab`, {
        credentials: 'include',
      })
      const payload = await response.json() as {
        ok: boolean
        data?: { collab: { version: number, stateBase64: string } }
      }

      if (!payload.ok || !payload.data) {
        return
      }

      if (payload.data.collab.version <= docVersionRef.current) {
        return
      }

      remoteApplyingRef.current = true
      const currentText = doc.getText('content')
      currentText.delete(0, currentText.length)
      Y.applyUpdate(doc, base64ToUint8(payload.data.collab.stateBase64))
      setDocContent(doc.getText('content').toString())
      setDocVersion(payload.data.collab.version)
      remoteApplyingRef.current = false
    }, 2000)

    return () => {
      text.unobserve(observer)

      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current)
      }

      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current)
      }
    }
  }, [activeDoc?.id, activeDoc?.docType, projectId])

  useEffect(() => {
    if (!activeDocId) {
      setPresenceMembers([])
      return
    }

    void pushPresence(false)
    void fetchPresence()

    if (presenceTimerRef.current) {
      window.clearInterval(presenceTimerRef.current)
    }

    presenceTimerRef.current = window.setInterval(() => {
      void pushPresence(typingActiveRef.current)
      void fetchPresence()
    }, 2000)

    return () => {
      if (presenceTimerRef.current) {
        window.clearInterval(presenceTimerRef.current)
      }
      if (typingTimerRef.current) {
        window.clearTimeout(typingTimerRef.current)
      }
      void pushPresence(false)
    }
  }, [activeDocId, projectId])

  useEffect(() => {
    if (!activeDoc || activeDoc.docType !== 'excel' || !projectId) {
      if (excelSyncTimerRef.current) {
        window.clearInterval(excelSyncTimerRef.current)
      }
      return
    }

    excelSyncTimerRef.current = window.setInterval(async () => {
      const response = await fetch(`/api/v1/projects/${projectId}/shared-docs/${activeDoc.id}`, {
        credentials: 'include',
      })
      const payload = await response.json() as { ok: boolean, data?: { doc: SharedDocItem } }

      if (!payload.ok || !payload.data) {
        return
      }

      if (payload.data.doc.version <= docVersionRef.current) {
        return
      }

      setDocVersion(payload.data.doc.version)
      setDocTitle(payload.data.doc.title)
      setDocContent(payload.data.doc.content)
      setSaveStatus('saved')
    }, 1200)

    return () => {
      if (excelSyncTimerRef.current) {
        window.clearInterval(excelSyncTimerRef.current)
      }
    }
  }, [activeDoc?.id, activeDoc?.docType, projectId])

  useEffect(() => {
    if (!activeDoc || !editable) {
      return
    }

    const shouldSaveExcel = activeDoc.docType === 'excel'
    const shouldSaveMarkdownTitle = activeDoc.docType === 'markdown' && docTitle !== activeDoc.title

    if (!shouldSaveExcel && !shouldSaveMarkdownTitle) {
      return
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveDocDraft()
    }, 700)

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [docTitle, docContent, activeDoc?.id, activeDoc?.docType, editable])

  const upload = async (file: File) => {
    if (!projectId) {
      return
    }

    setUploading(true)
    setUploadPercent(0)

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const formData = new FormData()
        formData.append('file', file)
        xhr.open('POST', `/api/v1/projects/${projectId}/shared-files`)
        xhr.withCredentials = true

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) {
            return
          }

          setUploadPercent(Math.round((event.loaded / event.total) * 100))
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
            return
          }

          reject(new Error('上传失败'))
        }
        xhr.onerror = () => reject(new Error('网络异常'))
        xhr.send(formData)
      })

      msgApi.success('上传成功')
      await fetchFiles()
    }
    catch (error) {
      msgApi.error(error instanceof Error ? error.message : '上传失败')
    }
    finally {
      setUploading(false)
    }
  }

  const handleDropUpload: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault()
    setDragOverUploadZone(false)

    if (!editable || uploading) {
      return
    }

    const file = event.dataTransfer.files?.item(0)

    if (!file) {
      msgApi.warning('未检测到可上传文件')
      return
    }

    void upload(file)
  }

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}
      <Tabs
        items={[
          {
            key: 'files',
            label: '共享文件',
            children: (
              <div
                className="rounded-xl border border-solid p-4"
                style={{
                  borderColor: dragOverUploadZone ? token.colorPrimary : token.colorBorderSecondary,
                  backgroundColor: dragOverUploadZone ? token.colorPrimaryBg : token.colorBgContainer,
                }}
                onDragEnter={(event) => {
                  event.preventDefault()
                  if (!editable || uploading) {
                    return
                  }
                  setDragOverUploadZone(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (!editable || uploading) {
                    return
                  }
                  setDragOverUploadZone(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  const nextTarget = event.relatedTarget as Node | null

                  if (nextTarget && event.currentTarget.contains(nextTarget)) {
                    return
                  }

                  setDragOverUploadZone(false)
                }}
                onDrop={handleDropUpload}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Typography.Title level={5}>共享文件区</Typography.Title>
                  <Button
                    disabled={!editable || uploading}
                    loading={uploading}
                    type="primary"
                    onClick={() => {
                      pickFile((file) => {
                        void upload(file)
                      })
                    }}
                  >
                    上传文件
                  </Button>
                </div>

                {uploading && <Progress percent={uploadPercent} size="small" status="active" />}
                {!uploading && (
                  <Typography.Paragraph className="!mb-3" type="secondary">
                    可将文件直接拖拽到此区域上传，或点击右上角按钮选择文件。
                  </Typography.Paragraph>
                )}

                <List
                  loading={loadingFiles}
                  dataSource={files}
                  locale={{ emptyText: '暂无共享文件' }}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button
                          key="download"
                          onClick={() => {
                            window.open(`/api/v1/projects/${projectId}/shared-files/${item.id}/download`, '_blank')
                          }}
                        >
                          下载
                        </Button>,
                        <Popconfirm
                          key="delete"
                          title="确认删除该文件？"
                          disabled={!editable}
                          onConfirm={() => {
                            void fetch(`/api/v1/projects/${projectId}/shared-files/${item.id}`, {
                              method: 'DELETE',
                              credentials: 'include',
                            }).then(() => fetchFiles())
                          }}
                        >
                          <Button danger disabled={!editable}>删除</Button>
                        </Popconfirm>,
                      ]}
                    >
                      <List.Item.Meta
                        title={item.name}
                        description={`上传者 ${item.uploaderUsername} · ${formatBytes(item.size)} · ${dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}`}
                      />
                    </List.Item>
                  )}
                />
              </div>
            ),
          },
          {
            key: 'docs',
            label: '在线文档',
            children: (
              <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-4">
                <div className="rounded-xl border border-solid p-3" style={{ borderColor: token.colorBorderSecondary }}>
                  <Space.Compact className="mb-3 w-full">
                    <Input
                      disabled={!editable}
                      placeholder="新文档标题"
                      value={creatingDocTitle}
                      onChange={(event) => {
                        setCreatingDocTitle(event.target.value)
                      }}
                    />
                    <Select
                      className="min-w-28"
                      disabled={!editable}
                      value={creatingDocType}
                      options={[
                        { label: 'Markdown', value: 'markdown' },
                        { label: 'Excel', value: 'excel' },
                      ]}
                      onChange={(value) => {
                        setCreatingDocType(value)
                      }}
                    />
                    <Button
                      disabled={!editable || !creatingDocTitle.trim()}
                      type="primary"
                      onClick={() => {
                        void fetch(`/api/v1/projects/${projectId}/shared-docs`, {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            title: creatingDocTitle,
                            docType: creatingDocType,
                            content: creatingDocType === 'excel' ? JSON.stringify([['']]) : '',
                          }),
                        }).then(async (response) => {
                          const payload = await response.json() as {
                            ok: boolean
                            data?: { docs: SharedDocItem[] }
                            error: string | null
                          }

                          if (!response.ok || !payload.ok || !payload.data) {
                            msgApi.error(payload.error ?? '创建失败')
                            return
                          }

                          setDocs(payload.data.docs)
                          setActiveDocId(payload.data.docs[0]?.id)
                          setCreatingDocTitle('')
                          setCreatingDocType('markdown')
                        })
                      }}
                    >
                      新建
                    </Button>
                  </Space.Compact>

                  <List
                    loading={loadingDocs}
                    dataSource={docs}
                    locale={{ emptyText: '暂无在线文档' }}
                    renderItem={(item) => (
                      <List.Item
                        className={activeDocId === item.id ? 'bg-black/5' : ''}
                        style={{ cursor: 'pointer', borderRadius: token.borderRadius }}
                        onClick={() => {
                          setActiveDocId(item.id)
                        }}
                      >
                        <List.Item.Meta
                          title={item.title}
                          description={(
                            <Space size={4} wrap>
                              <Tag>{item.docType === 'excel' ? 'Excel' : 'Markdown'}</Tag>
                              <Tag color="blue">v{item.version}</Tag>
                              <span>{item.creatorUsername}</span>
                            </Space>
                          )}
                        />
                      </List.Item>
                    )}
                  />
                </div>

                <div className="rounded-xl border border-solid" style={{ borderColor: token.colorBorderSecondary }}>
                  {activeDoc
                    ? (
                        <div className="flex h-[720px] flex-col">
                          <div
                            className="flex items-center justify-between gap-3 border-b border-solid px-4 py-3"
                            style={{ borderColor: token.colorBorderSecondary }}
                          >
                            <Input
                              disabled={!editable}
                              value={docTitle}
                              onChange={(event) => {
                                typingActiveRef.current = true
                                if (typingTimerRef.current) {
                                  window.clearTimeout(typingTimerRef.current)
                                }
                                typingTimerRef.current = window.setTimeout(() => {
                                  typingActiveRef.current = false
                                }, 1200)
                                setDocTitle(event.target.value)
                              }}
                            />
                            <Space>
                              <Tag color="geekblue">协同版本 v{docVersion}</Tag>
                              <Tag color={saveStatus === 'conflict' ? 'volcano' : saveStatus === 'error' ? 'red' : 'blue'}>
                                {saveStatus === 'saving'
                                  ? '自动保存中'
                                  : saveStatus === 'conflict'
                                    ? '存在冲突'
                                    : saveStatus === 'error'
                                      ? '保存失败'
                                      : '已同步'}
                              </Tag>
                              <Tag>
                                在线 {presenceMembers.length}
                                {presenceMembers.some((member) => member.isTyping) ? ' · 有人正在输入' : ''}
                              </Tag>
                              <Button
                                onClick={() => {
                                  window.open(`/api/v1/projects/${projectId}/shared-docs/${activeDoc.id}/export`, '_blank')
                                }}
                              >
                                导出 {activeDoc.docType === 'excel' ? 'XLSX' : 'MD'}
                              </Button>
                              <Button
                                danger
                                disabled={!editable}
                                onClick={() => {
                                  void fetch(`/api/v1/projects/${projectId}/shared-docs/${activeDoc.id}`, {
                                    method: 'DELETE',
                                    credentials: 'include',
                                  }).then(() => {
                                    void fetchDocs()
                                  })
                                }}
                              >
                                删除
                              </Button>
                            </Space>
                          </div>
                          <div className="flex-1 overflow-auto">
                            {activeDoc.docType === 'excel'
                              ? (
                                  <div className="space-y-3 p-4">
                                    <div className="flex gap-2">
                                      <Button disabled={!editable} onClick={appendExcelRow}>新增行</Button>
                                      <Button disabled={!editable} onClick={appendExcelColumn}>新增列</Button>
                                    </div>
                                    <div className="overflow-auto rounded-lg border border-solid" style={{ borderColor: token.colorBorderSecondary }}>
                                      <table className="w-full border-collapse text-sm">
                                        <tbody>
                                          {excelGrid.map((row, rowIndex) => (
                                            <tr key={`r-${rowIndex}`}>
                                              {row.map((cell, colIndex) => (
                                                <td
                                                  key={`c-${rowIndex}-${colIndex}`}
                                                  className="min-w-32 border border-solid p-1"
                                                  style={{ borderColor: token.colorBorderSecondary }}
                                                >
                                                  <Input
                                                    disabled={!editable}
                                                    value={cell}
                                                    onChange={(event) => {
                                                      setExcelCell(rowIndex, colIndex, event.target.value)
                                                    }}
                                                  />
                                                </td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )
                              : (
                                  <MarkdownEditor
                                    value={docContent}
                                    onChange={(nextValue) => {
                                      typingActiveRef.current = true
                                      if (typingTimerRef.current) {
                                        window.clearTimeout(typingTimerRef.current)
                                      }
                                      typingTimerRef.current = window.setTimeout(() => {
                                        typingActiveRef.current = false
                                      }, 1200)
                                      setDocContent(nextValue)

                                      if (!yDocRef.current) {
                                        return
                                      }

                                      const text = yDocRef.current.getText('content')
                                      remoteApplyingRef.current = true
                                      text.delete(0, text.length)
                                      text.insert(0, nextValue)
                                      remoteApplyingRef.current = false
                                    }}
                                  />
                                )}
                          </div>
                        </div>
                      )
                    : (
                        <div className="flex h-[720px] items-center justify-center text-sm" style={{ color: token.colorTextSecondary }}>
                          请选择或新建一个在线文档
                        </div>
                      )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
