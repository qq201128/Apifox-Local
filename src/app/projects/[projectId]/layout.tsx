import { Outlet, type LoaderFunctionArgs } from 'react-router'

import { resolveProjectAccess } from '@/router/page-auth'
import { requireRouteParam } from '@/router/route-param'

export async function loader({ params, request }: LoaderFunctionArgs) {
  const projectId = requireRouteParam(params.projectId, 'projectId')
  resolveProjectAccess(request, projectId, 'viewer')
  return null
}

export default function ProjectLayout() {
  return <Outlet />
}
