import { Col, Row, Skeleton, theme } from 'antd'
import { useMemo } from 'react'

import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { MenuItemType } from '@/enums'

export function Overview() {
  const { token } = theme.useToken()
  const { menuRawList } = useMenuHelpersContext()
  const stats = useMemo(() => {
    const list = menuRawList ?? []
    const apiCount = list.filter(({ type }) => type === MenuItemType.ApiDetail).length
    const apiCaseCount = list.filter(({ type }) => type === MenuItemType.HttpRequest).length
    const docCount = list.filter(({ type }) => type === MenuItemType.Doc).length
    const schemaCount = list.filter(({ type }) => type === MenuItemType.ApiSchema).length

    return {
      apiCount,
      apiCaseCount,
      docCount,
      schemaCount,
      testScenarioCount: apiCaseCount,
    }
  }, [menuRawList])

  return (
    <Row className="w-full overflow-hidden p-tabContent" gutter={[token.padding, token.padding]}>
      <Col span={24}>
        <div
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            padding: token.padding,
          }}
        >
          <div className="mb-4 text-lg">项目统计</div>
          <div className="flex flex-wrap">
            <div className="w-1/5">
              <div className="text-2xl">{stats.apiCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                接口数
              </div>
            </div>
            <div className="w-1/5">
              <div className="text-2xl">{stats.apiCaseCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                接口用例数
              </div>
            </div>
            <div className="w-1/5">
              <div className="text-2xl">{stats.docCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                文档数
              </div>
            </div>
            <div className="w-1/5">
              <div className="text-2xl">{stats.schemaCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                数据模型数
              </div>
            </div>
            <div className="w-1/5">
              <div className="text-2xl">{stats.testScenarioCount}</div>
              <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                测试场景数
              </div>
            </div>
          </div>
        </div>
      </Col>

      <Col span={16}>
        <div
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            padding: token.padding,
          }}
        >
          <Skeleton />
        </div>
      </Col>

      <Col span={8}>
        <div
          style={{
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadius,
            padding: token.padding,
          }}
        >
          <Skeleton />
        </div>
      </Col>
    </Row>
  )
}
