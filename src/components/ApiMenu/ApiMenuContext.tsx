import { createContext, useContext, useMemo, useState } from 'react'

import { CatalogType } from '@/enums'

import { type MenuState, useMenuData } from './api-menu-data'

interface ExpandedMenuKeysHelpers {
  addExpandedMenuKeys: (keys: string[]) => void
  removeExpandedMenuKeys: (keys: string[]) => void
}

interface ApiMenuContextData extends ExpandedMenuKeysHelpers, MenuState {
  expandedMenuKeys: string[]
}

const ApiMenuContext = createContext({} as ApiMenuContextData)

export function ApiMenuContextProvider(props: React.PropsWithChildren) {
  const { children } = props

  const [expandedMenuKeys, setExpandedMenuKeys] = useState<string[]>([
    CatalogType.Http,
    CatalogType.Schema,
    CatalogType.Request,
  ])

  const expandHelpers = useMemo<ExpandedMenuKeysHelpers>(() => {
    return {
      addExpandedMenuKeys: (keys) => {
        setExpandedMenuKeys((k) => Array.from(new Set([...k, ...keys])))
      },
      removeExpandedMenuKeys: (keys) => {
        setExpandedMenuKeys((k) => k.filter((key) => !keys.includes(key)))
      },
    }
  }, [setExpandedMenuKeys])

  const menuState = useMenuData()

  return (
    <ApiMenuContext.Provider value={{ expandedMenuKeys, ...expandHelpers, ...menuState }}>
      {children}
    </ApiMenuContext.Provider>
  )
}

export const useApiMenuContext = () => useContext(ApiMenuContext)
