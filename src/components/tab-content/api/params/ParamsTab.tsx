import { Form, Tabs, theme, Typography } from 'antd'

import type { ApiDetails, ProjectEnvironmentConfig } from '@/types'

import { ParamsEditableTable } from '../components/ParamsEditableTable'

import { GlobalParametersNotice } from './GlobalParametersNotice'
import { ParamsAuth } from './ParamsAuth'
import { ParamsBody } from './ParamsBody'

function BadgeLabel(props: React.PropsWithChildren<{ count?: number }>) {
  const { token } = theme.useToken()

  const { children, count } = props

  return (
    <span>
      {children}

      {typeof count === 'number' && count > 0
        ? (
            <span
              className="ml-1 inline-flex size-4 items-center justify-center rounded-full text-xs"
              style={{ backgroundColor: token.colorFillContent, color: token.colorSuccessActive }}
            >
              {count}
            </span>
          )
        : null}
    </span>
  )
}

interface ParamsTabProps {
  value?: ApiDetails['parameters']
  globalParameters?: ProjectEnvironmentConfig['globalParameters']
  onChange?: (value: ParamsTabProps['value']) => void
}

function getParamNameSet(params?: Array<{ name?: string, enable?: boolean }>) {
  return new Set(
    (params ?? [])
      .filter((item) => item.name && item.enable !== false)
      .map((item) => item.name as string),
  )
}

/**
 * 请求参数页签。
 */
export function ParamsTab(props: ParamsTabProps) {
  const { value, globalParameters, onChange } = props
  const queryNames = getParamNameSet(value?.query)
  const headerNames = new Set(Array.from(getParamNameSet(value?.header)).map(name => name.toLowerCase()))
  const cookieNames = getParamNameSet(value?.cookie)

  return (
    <Tabs
      animated={false}
      items={[
        {
          key: 'params',
          label: (
            <BadgeLabel count={(value?.query?.length ?? 0) + (value?.path?.length ?? 0)}>
              Params
            </BadgeLabel>
          ),
          children: (
            <div>
              <GlobalParametersNotice
                overriddenNames={queryNames}
                rows={globalParameters?.query}
                title="当前全局 Query 参数"
              />
              <div className="py-2">
                <Typography.Text type="secondary">Query 参数</Typography.Text>
              </div>
              <ParamsEditableTable
                value={value?.query}
                onChange={(query) => {
                  onChange?.({ ...value, query })
                }}
              />

              {value?.path && value.path.length > 0
                ? (
                    <>
                      <div className="py-2">
                        <Typography.Text type="secondary">Path 参数</Typography.Text>
                      </div>
                      <ParamsEditableTable
                        isPathParamsTable
                        autoNewRow={false}
                        removable={false}
                        value={value.path}
                        onChange={(path) => {
                          onChange?.({ ...value, path })
                        }}
                      />
                    </>
                  )
                : null}
            </div>
          ),
        },

        {
          key: 'body',
          label: 'Body',
          children: (
            <Form.Item noStyle name="requestBody">
              <ParamsBody globalRows={globalParameters?.body} />
            </Form.Item>
          ),
        },

        {
          key: 'headers',
          label: 'Headers',
          children: (
            <div className="pt-2">
              <GlobalParametersNotice
                overriddenNames={headerNames}
                normalizeName={name => name.toLowerCase()}
                rows={globalParameters?.header}
                title="当前全局 Header 参数"
              />
              <ParamsEditableTable
                value={value?.header}
                onChange={(header) => {
                  onChange?.({ ...value, header })
                }}
              />
            </div>
          ),
        },

        {
          key: 'cookie',
          label: 'Cookie',
          children: (
            <div className="pt-2">
              <GlobalParametersNotice
                overriddenNames={cookieNames}
                rows={globalParameters?.cookie}
                title="当前全局 Cookie 参数"
              />
              <ParamsEditableTable
                value={value?.cookie}
                onChange={(cookie) => {
                  onChange?.({ ...value, cookie })
                }}
              />
            </div>
          ),
        },

        {
          key: 'auth',
          label: 'Auth',
          children: (
            <Form.Item noStyle name="auth">
              <ParamsAuth />
            </Form.Item>
          ),
        },
      ]}
    />
  )
}
