import { randomUUID } from 'node:crypto'

import type { ApiMenuData } from '@/components/ApiMenu'
import { ROOT_CATALOG } from '@/configs/static'

import { getProjectState } from './project-state'
import { getMaxSortOrder, insertMenuItem, listMenuItems, runInTransaction } from './db/menu-repo'

function normalizeParentId(parentId?: string) {
  if (!parentId || parentId === ROOT_CATALOG) {
    return undefined
  }

  return parentId
}

function assertUniqueImportedMenuIds(menuItems: ApiMenuData[]) {
  const seenIds = new Set<string>()

  menuItems.forEach((item) => {
    if (seenIds.has(item.id)) {
      throw new Error(`导入数据包含重复菜单 ID：${item.id}`)
    }

    seenIds.add(item.id)
  })
}

function reserveImportedId(preferredId: string, occupiedIds: Set<string>) {
  if (!occupiedIds.has(preferredId)) {
    occupiedIds.add(preferredId)
    return preferredId
  }

  let nextId = randomUUID()

  while (occupiedIds.has(nextId)) {
    nextId = randomUUID()
  }

  occupiedIds.add(nextId)
  return nextId
}

function buildImportedIdMap(menuItems: ApiMenuData[], occupiedIds: Set<string>) {
  const importedIdMap = new Map<string, string>()

  menuItems.forEach((item) => {
    importedIdMap.set(item.id, reserveImportedId(item.id, occupiedIds))
  })

  return importedIdMap
}

function resolveImportedParentId(
  parentId: string | undefined,
  importedIdMap: Map<string, string>,
) {
  const normalizedParentId = normalizeParentId(parentId)

  if (!normalizedParentId) {
    return undefined
  }

  return importedIdMap.get(normalizedParentId) ?? normalizedParentId
}

export function mergeProjectStateWithMenuItems(projectId: string, menuItems: ApiMenuData[]) {
  assertUniqueImportedMenuIds(menuItems)

  runInTransaction(() => {
    const occupiedIds = new Set(listMenuItems(projectId).map(({ id }) => id))
    const importedIdMap = buildImportedIdMap(menuItems, occupiedIds)
    let sortOrder = getMaxSortOrder(projectId)

    menuItems.forEach((item) => {
      sortOrder += 1

      insertMenuItem({
        projectId,
        id: importedIdMap.get(item.id) ?? item.id,
        parentId: resolveImportedParentId(item.parentId, importedIdMap),
        name: item.name,
        type: item.type,
        dataJson: item.data ? JSON.stringify(item.data) : undefined,
        sortOrder,
      })
    })
  })

  return getProjectState(projectId)
}
