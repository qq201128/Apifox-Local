import { type ActionFunctionArgs } from 'react-router'

import { fail, ok } from '@/server/api-response'
import { requireRouteParam } from '@/router/route-param'
import { getSessionUserFromRequest } from '@/server/auth'
import { importApiDocumentToMenuItems } from '@/server/api-document-import'
import { ensureProjectPermission } from '@/server/project-access'
import { replaceProjectStateWithMenuItems } from '@/server/project-state'

async function importProjectDocument(request: Request, projectId: string) {
  const routeTag = '[api][projects/imports]'
  const startedAt = Date.now()
  let lastMark = startedAt
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return fail('未登录', 401)
  }

  const access = ensureProjectPermission({ projectId, userId: user.id, required: 'editor' })

  if ('error' in access) {
    return access.error
  }

  const formData = await request.formData()
  const file = formData.get('file')
  lastMark = Date.now()

  if (!(file instanceof File)) {
    console.warn(`${routeTag} step=invalid_file projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`)
    return fail('请上传接口文档文件')
  }

  const filename = file.name.toLowerCase()

  if (!filename.endsWith('.json') && !filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
    console.warn(`${routeTag} step=invalid_extension projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`)
    return fail('仅支持 .json/.yaml/.yml 文件')
  }

  const content = await file.text()
  console.warn(`${routeTag} step=read_file_text projectId=${projectId} userId=${user.id} elapsedMs=${Date.now() - lastMark} size=${content.length}`)
  lastMark = Date.now()

  if (!content.trim()) {
    console.warn(`${routeTag} step=empty_content projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`)
    return fail('文件内容为空')
  }

  try {
    const menuItems = importApiDocumentToMenuItems(content, filename)
    console.warn(`${routeTag} step=import_document projectId=${projectId} userId=${user.id} elapsedMs=${Date.now() - lastMark} menuItems=${menuItems.length}`)
    lastMark = Date.now()
    const nextState = replaceProjectStateWithMenuItems(projectId, menuItems)
    console.warn(`${routeTag} step=replace_project_state projectId=${projectId} userId=${user.id} elapsedMs=${Date.now() - lastMark}`)
    console.warn(`${routeTag} step=done projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`)

    return ok(nextState)
  }
  catch (error) {
    console.error(`${routeTag} step=failed projectId=${projectId} userId=${user.id} totalMs=${Date.now() - startedAt}`, error)
    return fail(error instanceof Error ? error.message : '导入失败')
  }
}

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
  }

  const projectId = requireRouteParam(params.projectId, 'projectId')
  return importProjectDocument(request, projectId)
}
