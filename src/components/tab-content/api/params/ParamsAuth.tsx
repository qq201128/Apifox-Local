import { Input, Select, Space, Typography } from 'antd'

import type { ApiDetails, ApiRequestAuth, ApiRequestAuthTarget } from '@/types'

const DEFAULT_API_KEY_TARGET: ApiRequestAuthTarget = 'header'
const DEFAULT_API_KEY_NAME = 'X-API-Key'

const AUTH_TYPE_OPTIONS = [
  { label: '无鉴权', value: 'none' },
  { label: 'Bearer Token', value: 'bearer' },
  { label: 'Basic Auth', value: 'basic' },
  { label: 'API Key', value: 'apiKey' },
] satisfies Array<{ label: string, value: ApiRequestAuth['type'] }>

const API_KEY_TARGET_OPTIONS = [
  { label: 'Header', value: 'header' },
  { label: 'Query', value: 'query' },
  { label: 'Cookie', value: 'cookie' },
] satisfies Array<{ label: string, value: ApiRequestAuthTarget }>

interface ParamsAuthProps {
  value?: ApiDetails['auth']
  onChange?: (value: ParamsAuthProps['value']) => void
}

function createAuthValue(type: ApiRequestAuth['type']): ApiRequestAuth {
  if (type === 'bearer') {
    return { type, token: '' }
  }

  if (type === 'basic') {
    return { type, username: '', password: '' }
  }

  if (type === 'apiKey') {
    return {
      type,
      key: DEFAULT_API_KEY_NAME,
      value: '',
      target: DEFAULT_API_KEY_TARGET,
    }
  }

  return { type: 'none' }
}

function updateAuthValue(
  value: ApiRequestAuth,
  patch: Partial<Extract<ApiRequestAuth, { type: 'bearer' | 'basic' | 'apiKey' }>>,
) {
  return { ...value, ...patch }
}

function renderBearerField(
  value: Extract<ApiRequestAuth, { type: 'bearer' }>,
  onChange?: (value: ApiRequestAuth) => void,
) {
  return (
    <Input.Password
      placeholder="输入 Token，支持 {{token}}"
      value={value.token}
      onChange={(event) => {
        onChange?.(updateAuthValue(value, { token: event.target.value }) as ApiRequestAuth)
      }}
    />
  )
}

function renderBasicField(
  value: Extract<ApiRequestAuth, { type: 'basic' }>,
  onChange?: (value: ApiRequestAuth) => void,
) {
  return (
    <Space.Compact block>
      <Input
        placeholder="用户名，支持 {{username}}"
        value={value.username}
        onChange={(event) => {
          onChange?.(updateAuthValue(value, { username: event.target.value }) as ApiRequestAuth)
        }}
      />
      <Input.Password
        placeholder="密码，支持 {{password}}"
        value={value.password}
        onChange={(event) => {
          onChange?.(updateAuthValue(value, { password: event.target.value }) as ApiRequestAuth)
        }}
      />
    </Space.Compact>
  )
}

function renderApiKeyField(
  value: Extract<ApiRequestAuth, { type: 'apiKey' }>,
  onChange?: (value: ApiRequestAuth) => void,
) {
  return (
    <Space.Compact block>
      <Select
        className="min-w-[120px]"
        options={API_KEY_TARGET_OPTIONS}
        value={value.target}
        onChange={(target: ApiRequestAuthTarget) => {
          onChange?.(updateAuthValue(value, { target }) as ApiRequestAuth)
        }}
      />
      <Input
        placeholder="参数名，如 X-API-Key"
        value={value.key}
        onChange={(event) => {
          onChange?.(updateAuthValue(value, { key: event.target.value }) as ApiRequestAuth)
        }}
      />
      <Input.Password
        placeholder="参数值，支持 {{apiKey}}"
        value={value.value}
        onChange={(event) => {
          onChange?.(updateAuthValue(value, { value: event.target.value }) as ApiRequestAuth)
        }}
      />
    </Space.Compact>
  )
}

function renderAuthFields(
  value: ApiRequestAuth,
  onChange?: (value: ApiRequestAuth) => void,
) {
  if (value.type === 'none') {
    return <Typography.Text type="secondary">当前接口不附带额外鉴权信息。</Typography.Text>
  }

  if (value.type === 'bearer') {
    return renderBearerField(value, onChange)
  }

  if (value.type === 'basic') {
    return renderBasicField(value, onChange)
  }

  return renderApiKeyField(value, onChange)
}

export function ParamsAuth(props: ParamsAuthProps) {
  const { value, onChange } = props
  const authValue: ApiRequestAuth = value ?? { type: 'none' }

  return (
    <div className="grid gap-3 pt-2">
      <div className="flex items-center justify-between gap-4">
        <Typography.Text type="secondary">请求鉴权</Typography.Text>
        <Select
          className="min-w-[180px]"
          options={AUTH_TYPE_OPTIONS}
          value={authValue.type}
          onChange={(type: ApiRequestAuth['type']) => {
            onChange?.(createAuthValue(type))
          }}
        />
      </div>

      {renderAuthFields(authValue, onChange as (value: ApiRequestAuth) => void)}

      <Typography.Text type="secondary">
        支持使用
        {' '}
        {'{{变量名}}'}
        {' '}
        引用环境变量。Auth 注入的同名 Header、Query、Cookie 会覆盖当前请求参数表中的同名项。
      </Typography.Text>
    </div>
  )
}
