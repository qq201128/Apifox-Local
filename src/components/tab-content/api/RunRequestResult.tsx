import { Card, Descriptions, Tag, Typography, theme } from 'antd'

import { JsonViewer } from '@/components/JsonViewer'
import type { ApiRunResult } from '@/types'

function getStatusColor(status: number) {
  if (status >= 500) {
    return 'error'
  }

  if (status >= 400) {
    return 'warning'
  }

  if (status >= 300) {
    return 'processing'
  }

  return 'success'
}

function RequestEntryList(props: { entries: ApiRunResult['requestHeaders'], emptyText: string }) {
  const { token } = theme.useToken()
  const { entries, emptyText } = props

  if (entries.length === 0) {
    return <Typography.Text type="secondary">{emptyText}</Typography.Text>
  }

  return (
    <div className="grid gap-2">
      {entries.map((entry, index) => (
        <div
          key={`${entry.name}-${index}`}
          className="grid gap-2 rounded-md px-3 py-2"
          style={{
            backgroundColor: token.colorFillAlter,
            gridTemplateColumns: '220px minmax(0, 1fr)',
          }}
        >
          <span className="font-medium">{entry.name}</span>
          <span className="break-all">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export function RunRequestResult(props: { result: ApiRunResult }) {
  const { result } = props
  const { token } = theme.useToken()
  const isJson = result.contentType?.toLowerCase().includes('json') ?? false
  const requestContentType = result.requestHeaders.find(({ name }) => name.toLowerCase() === 'content-type')?.value
  const isRequestJson = requestContentType?.toLowerCase().includes('json') ?? false

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto">
      <Card size="small">
        <Descriptions
          column={2}
          items={[
            {
              key: 'status',
              label: '状态',
              children: (
                <Tag color={getStatusColor(result.status)}>
                  {result.status}
                  {' '}
                  {result.statusText}
                </Tag>
              ),
            },
            { key: 'method', label: '方法', children: result.method },
            { key: 'duration', label: '耗时', children: `${result.durationMs} ms` },
            { key: 'contentType', label: 'Content-Type', children: result.contentType ?? '-' },
          ]}
        />
      </Card>

      <Card size="small" title="请求地址">
        <Typography.Paragraph className="!mb-0 break-all" copyable={{ text: result.url }}>
          {result.url}
        </Typography.Paragraph>
      </Card>

      <Card size="small" title={`最终请求头（${result.requestHeaders.length}）`}>
        <RequestEntryList emptyText="无请求头" entries={result.requestHeaders} />
      </Card>

      <Card size="small" title={`最终 Query 参数（${result.requestQuery.length}）`}>
        <RequestEntryList emptyText="无 Query 参数" entries={result.requestQuery} />
      </Card>

      <Card size="small" title={`最终 Cookie 参数（${result.requestCookie.length}）`}>
        <RequestEntryList emptyText="无 Cookie 参数" entries={result.requestCookie} />
      </Card>

      {(result.requestBodyParameters.length > 0 || result.requestBodyText)
        ? (
            <Card size="small" title="最终请求体">
              {result.requestBodyParameters.length > 0
                ? (
                    <RequestEntryList emptyText="无请求体参数" entries={result.requestBodyParameters} />
                  )
                : isRequestJson
                  ? <JsonViewer value={result.requestBodyText ?? ''} />
                  : (
                      <pre
                        className="m-0 whitespace-pre-wrap break-all rounded-md p-3"
                        style={{ backgroundColor: token.colorFillAlter }}
                      >
                        {result.requestBodyText}
                      </pre>
                    )}
            </Card>
          )
        : null}

      <Card size="small" title={`响应头（${result.headers.length}）`}>
        <RequestEntryList emptyText="无响应头" entries={result.headers} />
      </Card>

      <Card size="small" title="响应体">
        {result.body
          ? (
              isJson
                ? <JsonViewer value={result.body} />
                : (
                    <pre
                      className="m-0 whitespace-pre-wrap break-all rounded-md p-3"
                      style={{ backgroundColor: token.colorFillAlter }}
                    >
                      {result.body}
                    </pre>
                  )
            )
          : (
              <Typography.Text type="secondary">无响应体</Typography.Text>
            )}
      </Card>
    </div>
  )
}
