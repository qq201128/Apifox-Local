import { useMemo } from 'react'

import { Button, Dropdown, theme, Typography } from 'antd'
import { CheckIcon, ChevronDownIcon, CogIcon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'

function resolveProjectId(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  return parts.at(0) === 'projects' ? parts.at(1) : undefined
}

function getEnvironmentMark(name: string) {
  return name.trim().charAt(0).toUpperCase() || '环'
}

export function ProjectEnvironmentSwitch() {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const menuHelpers = useMenuHelpersContext()
  const projectEnvironments = menuHelpers.projectEnvironments ?? []
  const currentProjectEnvironmentId = menuHelpers.currentProjectEnvironmentId
  const setCurrentProjectEnvironmentId = menuHelpers.setCurrentProjectEnvironmentId

  const projectId = useMemo(() => resolveProjectId(pathname), [pathname])

  const currentEnvironment = projectEnvironments.find(({ id }) => id === currentProjectEnvironmentId)

  if (!projectId) {
    return null
  }

  const environmentItems = projectEnvironments.map((environment) => ({
    key: environment.id,
    label: (
      <div className="flex min-w-[220px] items-center gap-3 py-1">
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
          style={{
            color: token.colorPrimary,
            backgroundColor: token.colorPrimaryBg,
          }}
        >
          {getEnvironmentMark(environment.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{environment.name}</div>
          <div className="truncate text-xs opacity-60">{getPrimaryEnvironmentUrl(environment)}</div>
        </div>
        {currentProjectEnvironmentId === environment.id && <CheckIcon size={14} />}
      </div>
    ),
    onClick: () => {
      setCurrentProjectEnvironmentId?.(environment.id)
    },
  }))

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          ...environmentItems,
          { type: 'divider' as const },
          {
            key: 'manage',
            icon: <CogIcon size={14} />,
            label: '管理环境',
            onClick: () => {
              navigate(`/projects/${projectId}/settings?section=environments`)
            },
          },
        ],
      }}
    >
      <Button
        className="min-w-[140px] justify-between"
        style={{
          height: 32,
          borderColor: token.colorBorderSecondary,
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
            style={{
              color: token.colorPrimary,
              backgroundColor: token.colorPrimaryBg,
            }}
          >
            {getEnvironmentMark(currentEnvironment?.name ?? '未')}
          </span>
          <Typography.Text ellipsis className="max-w-[120px] !mb-0">
            {currentEnvironment?.name ?? '选择环境'}
          </Typography.Text>
        </span>
        <ChevronDownIcon size={14} />
      </Button>
    </Dropdown>
  )
}
