import { redirect, type LoaderFunctionArgs } from 'react-router'

import { getSessionUserFromRequest } from '@/server/auth'

export async function loader({ request }: LoaderFunctionArgs) {
  const { user } = getSessionUserFromRequest(request)

  if (!user) {
    return redirect('/login')
  }

  return redirect('/projects')
}

export default function RootPage() {
  return null
}
