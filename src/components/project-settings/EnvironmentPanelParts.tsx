import { Button, Input, Switch, Typography, theme } from 'antd'
import { GlobeIcon, KeyRoundIcon, PlusIcon, ShieldIcon, TrashIcon } from 'lucide-react'

import { createEnvironmentBaseUrl, createEnvironmentValue } from '@/project-environment-utils'
import type { ApiEnvironment, ApiEnvironmentBaseUrl, ProjectEnvironmentConfig } from '@/types'

import { ValueEditor } from './ValueEditor'

export type GlobalSectionKey = 'globalVariables' | 'globalParameters' | 'vaultSecrets'
export type EnvironmentSectionKey = `environment:${string}`
export type SectionKey = GlobalSectionKey | EnvironmentSectionKey
export const GLOBAL_SECTION_ITEMS: Array<{
  key: GlobalSectionKey
  label: string
  icon: React.ReactNode
  description: string
}> = [
  {
    key: 'globalVariables',
    label: '全局变量',
    icon: <GlobeIcon size={14} />,
    description: '用于维护所有环境共享的通用变量。',
  },
  {
    key: 'globalParameters',
    label: '全局参数',
    icon: <KeyRoundIcon size={14} />,
    description: '用于按 Header、Cookie、Query、Body 分类维护跨环境复用的请求参数。',
  },
  {
    key: 'vaultSecrets',
    label: 'Vault Secrets（密钥库）',
    icon: <ShieldIcon size={14} />,
    description: '用于保存敏感值，当前按项目独立存储。',
  },
]
function updateBaseUrlRow(
  list: ApiEnvironmentBaseUrl[],
  targetId: string,
  field: keyof ApiEnvironmentBaseUrl,
  value: string,
) {
  return list.map((item) => (item.id === targetId ? { ...item, [field]: value } : item))
}
export function createEnvironmentKey(environmentId: string) {
  return `environment:${environmentId}` as EnvironmentSectionKey
}
function isEnvironmentSection(key: SectionKey): key is EnvironmentSectionKey {
  return key.startsWith('environment:')
}
export function getFallbackSection(config: ProjectEnvironmentConfig) {
  return config.environments[0] ? createEnvironmentKey(config.environments[0].id) : 'globalVariables'
}
export function resolveEnvironment(config: ProjectEnvironmentConfig, key: SectionKey) {
  if (!isEnvironmentSection(key)) {
    return undefined
  }
  return config.environments.find(({ id }) => id === key.slice('environment:'.length))
}

function FieldGrid(props: {
  editable: boolean
  title: string
  description: string
  headers: string[]
  children: React.ReactNode
  onAdd?: () => void
}) {
  const { token } = theme.useToken()
  const { editable, title, description, headers, children, onAdd } = props

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Typography.Title level={5}>{title}</Typography.Title>
          <Typography.Paragraph className="!mb-0" type="secondary">{description}</Typography.Paragraph>
        </div>
        {onAdd && (
          <Button disabled={!editable} icon={<PlusIcon size={14} />} onClick={onAdd}>
            添加
          </Button>
        )}
      </div>

      <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>
          {headers.map((header) => (
            <div
              key={header}
              className="px-3 py-2 text-sm"
              style={{ borderBottom: `1px solid ${token.colorBorderSecondary}`, color: token.colorTextSecondary }}
            >
              {header}
            </div>
          ))}
        </div>
        {children}
      </div>
    </section>
  )
}

export function EnvironmentEditor(props: {
  editable: boolean
  environment: ApiEnvironment
  onChange: (nextEnvironment: ApiEnvironment) => void
  onDelete: () => void
}) {
  const { token } = theme.useToken()
  const { editable, environment, onChange, onDelete } = props
  const baseUrls = environment.baseUrls ?? []
  const variables = environment.variables ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-4">
          <Input
            disabled={!editable}
            placeholder="环境名称"
            size="large"
            value={environment.name}
            onChange={(event) => {
              onChange({ ...environment, name: event.target.value })
            }}
          />
          <div className="flex items-center gap-3">
            <Typography.Text>共享</Typography.Text>
            <Switch
              checked={environment.shared ?? true}
              disabled={!editable}
              onChange={(checked) => {
                onChange({ ...environment, shared: checked })
              }}
            />
          </div>
        </div>
        <Button danger disabled={!editable} icon={<TrashIcon size={14} />} onClick={onDelete}>
          删除环境
        </Button>
      </div>

      <FieldGrid
        description="每个环境都可以维护多个模块的前置 URL，当前运行默认使用第一项。"
        editable={editable}
        headers={['模块', '前置 URL', '']}
        title="前置 URL"
        onAdd={() => {
          onChange({ ...environment, baseUrls: [...baseUrls, createEnvironmentBaseUrl()] })
        }}
      >
        {baseUrls.length === 0
          ? (
              <div className="px-3 py-6 text-center" style={{ color: token.colorTextSecondary }}>
                当前还没有前置 URL，点击右上角“添加”创建模块。
              </div>
            )
          : baseUrls.map((item, index) => (
              <div
                key={item.id}
                className="grid"
                style={{
                  gridTemplateColumns: '220px minmax(0,1fr) 56px',
                  borderBottom: index === baseUrls.length - 1 ? 'none' : `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <Input
                  variant="borderless"
                  disabled={!editable}
                  placeholder="默认模块"
                  value={item.name}
                  onChange={(event) => {
                    onChange({ ...environment, baseUrls: updateBaseUrlRow(baseUrls, item.id, 'name', event.target.value) })
                  }}
                />
                <Input
                  variant="borderless"
                  disabled={!editable}
                  placeholder="https://api.example.com"
                  value={item.url}
                  onChange={(event) => {
                    onChange({ ...environment, baseUrls: updateBaseUrlRow(baseUrls, item.id, 'url', event.target.value) })
                  }}
                />
                <div className="flex items-center justify-center">
                  <Button
                    danger
                    disabled={!editable}
                    icon={<TrashIcon size={14} />}
                    type="text"
                    onClick={() => {
                      onChange({ ...environment, baseUrls: baseUrls.filter(({ id }) => id !== item.id) })
                    }}
                  />
                </div>
              </div>
            ))}
      </FieldGrid>

      <ValueEditor
        description="环境变量支持远程值和本地值，本地值优先，可用于本地调试覆盖。"
        editable={editable}
        rows={variables}
        title="环境变量"
        onAdd={() => {
          onChange({ ...environment, variables: [...variables, createEnvironmentValue()] })
        }}
        onChange={(nextRows) => {
          onChange({ ...environment, variables: nextRows })
        }}
      />
    </div>
  )
}
