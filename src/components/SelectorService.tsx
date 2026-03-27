import { Select, type SelectProps } from 'antd'

import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'

interface SelectorServiceProps {
  value?: string
  onChange?: (value: SelectorServiceProps['value']) => void
}

export function SelectorService(props: SelectorServiceProps) {
  const { projectEnvironments } = useMenuHelpersContext()

  const serviceOptions: SelectProps['options'] = [
    {
      label: '默认设置',
      options: [
        {
          label: (
            <span className="flex items-center justify-between font-normal">
              <span>继承父级</span>
              <span className="ml-10 truncate opacity-50">跟随父级目录设置（推荐）</span>
            </span>
          ),
          value: '',
        },
      ],
    },
    {
      label: '项目环境',
      options: projectEnvironments.map((environment) => ({
        label: (
          <span className="flex items-center justify-between font-normal">
            <span>{environment.name}</span>
            <span className="ml-10 truncate opacity-50">{getPrimaryEnvironmentUrl(environment)}</span>
          </span>
        ),
        value: environment.id,
      })),
    },
  ]

  return (
    <Select
      {...props}
      options={serviceOptions}
      placeholder={projectEnvironments.length > 0 ? '选择运行环境' : '请先在项目设置中创建环境'}
    />
  )
}
