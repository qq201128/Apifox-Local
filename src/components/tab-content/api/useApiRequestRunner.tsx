import { useCallback, useState } from 'react'
import { useParams } from 'react-router'

import { useTabContentContext } from '@/components/ApiTab/TabContentContext'
import { SERVER_INHERIT } from '@/configs/static'
import { useGlobalContext } from '@/contexts/global'
import { useMenuHelpersContext } from '@/contexts/menu-helpers'
import { findFolders } from '@/helpers'
import { getPrimaryEnvironmentUrl } from '@/project-environment-utils'
import type { ApiDetails, ApiEnvironment, ApiFolder, ApiRunResult } from '@/types'

import { RunRequestResult } from './RunRequestResult'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i

interface ApiResponse<T> {
  ok: boolean
  data: T | null
  error: string | null
}

function normalizeBaseUrl(value: string) {
  const normalized = value.trim()

  if (!ABSOLUTE_URL_REGEX.test(normalized)) {
    throw new Error('前置 URL 必须以 http:// 或 https:// 开头')
  }

  return normalized
}

function resolveInlineBaseUrl(value?: string) {
  if (!value?.trim()) {
    return undefined
  }

  return ABSOLUTE_URL_REGEX.test(value.trim())
    ? normalizeBaseUrl(value)
    : undefined
}

function getEnvironmentBaseUrl(projectEnvironments: ApiEnvironment[], environmentId: string) {
  const environment = projectEnvironments.find(({ id }) => id === environmentId)

  if (!environment) {
    throw new Error(`环境不存在：${environmentId}`)
  }

  return normalizeBaseUrl(getPrimaryEnvironmentUrl(environment))
}

function getExplicitEnvironmentId(serverId?: string) {
  const normalized = serverId?.trim() ?? SERVER_INHERIT

  if (!normalized || normalized === SERVER_INHERIT || normalized === 'default') {
    return undefined
  }

  return normalized
}

export function useApiRequestRunner() {
  const [running, setRunning] = useState(false)

  const { projectId } = useParams()
  const { tabData } = useTabContentContext()
  const { messageApi, modal } = useGlobalContext()
  const {
    menuRawList,
    projectEnvironments,
    currentProjectEnvironmentId,
  } = useMenuHelpersContext()

  const resolveParentFolders = useCallback(() => {
    const currentMenu = menuRawList?.find(({ id }) => id === tabData.key)

    return currentMenu?.parentId
      ? findFolders(menuRawList ?? [], [], currentMenu.parentId)
      : []
  }, [menuRawList, tabData.key])

  const resolveEnvironmentId = useCallback((apiDetails: ApiDetails) => {
    const explicitEnvironmentId = getExplicitEnvironmentId(apiDetails.serverId)

    if (explicitEnvironmentId) {
      return explicitEnvironmentId
    }

    const parentFolders = resolveParentFolders()

    for (let index = parentFolders.length - 1; index >= 0; index -= 1) {
      const folderData = parentFolders[index]?.data as ApiFolder | undefined
      const folderEnvironmentId = getExplicitEnvironmentId(folderData?.serverId)

      if (folderEnvironmentId) {
        return folderEnvironmentId
      }
    }

    return currentProjectEnvironmentId
  }, [currentProjectEnvironmentId, resolveParentFolders])

  const resolveBaseUrlOverride = useCallback((apiDetails: ApiDetails, environmentId?: string) => {
    const path = apiDetails.path?.trim() ?? ''
    const usesAbsoluteUrl = ABSOLUTE_URL_REGEX.test(path)
    const inlineBaseUrl = resolveInlineBaseUrl(apiDetails.serverUrl)
    const explicitEnvironmentId = getExplicitEnvironmentId(apiDetails.serverId)

    if (explicitEnvironmentId) {
      return usesAbsoluteUrl
        ? undefined
        : getEnvironmentBaseUrl(projectEnvironments, explicitEnvironmentId)
    }

    if (inlineBaseUrl) {
      return usesAbsoluteUrl ? undefined : inlineBaseUrl
    }

    const parentFolders = resolveParentFolders()

    for (let index = parentFolders.length - 1; index >= 0; index -= 1) {
      const folderData = parentFolders[index]?.data as ApiFolder | undefined
      const folderEnvironmentId = getExplicitEnvironmentId(folderData?.serverId)
      const folderInlineBaseUrl = resolveInlineBaseUrl(folderData?.serverUrl)

      if (folderEnvironmentId) {
        return usesAbsoluteUrl
          ? undefined
          : getEnvironmentBaseUrl(projectEnvironments, folderEnvironmentId)
      }

      if (folderInlineBaseUrl) {
        return usesAbsoluteUrl ? undefined : folderInlineBaseUrl
      }
    }

    if (environmentId) {
      return usesAbsoluteUrl ? undefined : getEnvironmentBaseUrl(projectEnvironments, environmentId)
    }

    if (usesAbsoluteUrl) {
      return undefined
    }

    throw new Error('请先在顶部选择环境，或到“管理环境”中配置前置 URL')
  }, [projectEnvironments, resolveParentFolders])

  const run = useCallback(async (apiDetails: ApiDetails) => {
    if (!projectId) {
      messageApi.error('当前不在项目页面，无法运行请求')

      return
    }

    setRunning(true)

    try {
      const environmentId = resolveEnvironmentId(apiDetails)
      const baseUrlOverride = resolveBaseUrlOverride(apiDetails, environmentId)
      const response = await fetch(`/api/v1/projects/${projectId}/requests/run`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiDetails, baseUrlOverride, environmentId }),
      })
      const payload = await response.json() as ApiResponse<ApiRunResult>

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? '运行失败')
      }

      modal.info({
        title: '运行结果',
        icon: null,
        width: 960,
        okText: '关闭',
        content: <RunRequestResult result={payload.data} />,
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '运行失败'
      messageApi.error(message)
    }
    finally {
      setRunning(false)
    }
  }, [messageApi, modal, projectId, resolveBaseUrlOverride, resolveEnvironmentId])

  return {
    run,
    running,
  }
}
