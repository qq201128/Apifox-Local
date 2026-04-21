import { randomUUID } from 'node:crypto'

import type { ApiMenuData } from '@/components/ApiMenu'
import { ROOT_CATALOG, SERVER_INHERIT } from '@/configs/static'
import { CatalogType, MenuItemType } from '@/enums'
import { getCatalogType, isMenuFolder } from '@/helpers'
import type { ApiEnvironment, ProjectEnvironmentConfig, RecycleData, RecycleDataItem } from '@/types'

import {
  clearExpiredRecycleItems,
  deleteMenuItems,
  deleteRecycleItems,
  getMaxSortOrder,
  getMenuItem,
  getRecycleItemsByIds,
  insertMenuItem,
  insertRecycleItem,
  listMenuItems,
  listRecycleItems,
  type RecycleItemRow,
  runInTransaction,
  updateMenuItem,
  updateMenuSortOrder,
} from './db/menu-repo'
import { RECYCLE_TTL_MS } from './constants'
import { listProjectEnvironmentConfig } from './project-environments'

interface StateSnapshot {
  menuRawList: ApiMenuData[]
  recyleRawData: RecycleData
  projectEnvironments: ApiEnvironment[]
  projectEnvironmentConfig: ProjectEnvironmentConfig
}

function parseJsonValue<T>(value: string | null | undefined, fallback: T) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  }
  catch {
    return fallback
  }
}

function toMenuData(row: ReturnType<typeof listMenuItems>[number]): ApiMenuData {
  const data = parseJsonValue<Record<string, unknown> | undefined>(row.data_json, undefined)

  return {
    id: row.id,
    parentId: row.parent_id ?? undefined,
    name: row.name,
    type: row.type as MenuItemType,
    data,
  } as ApiMenuData
}

function toRecycleData(projectId: string): RecycleData {
  clearExpiredRecycleItems({ projectId, now: Date.now() })

  const rows = listRecycleItems(projectId)
  const grouped: RecycleData = {
    [CatalogType.Http]: { list: [] },
    [CatalogType.Schema]: { list: [] },
    [CatalogType.Request]: { list: [] },
  }

  rows.forEach((row) => {
    const deletedItem = parseJsonValue<ApiMenuData | null>(row.deleted_item_json, null)
    const creator = parseJsonValue<RecycleDataItem['creator'] | null>(row.creator_json, null)

    if (!deletedItem || !creator) {
      return
    }

    const remainMs = row.expires_at - Date.now()
    const remainDays = Math.max(0, Math.ceil(remainMs / (24 * 60 * 60 * 1000)))
    const expiredAt = `${remainDays}天`

    grouped[row.catalog_type as keyof RecycleData].list?.push({
      id: row.id,
      creator,
      deletedItem,
      expiredAt,
    })
  })

  return grouped
}

function getTypeGroup(type: MenuItemType) {
  if (
    type === MenuItemType.ApiDetail
    || type === MenuItemType.ApiDetailFolder
    || type === MenuItemType.Doc
  ) {
    return CatalogType.Http
  }

  if (type === MenuItemType.ApiSchema || type === MenuItemType.ApiSchemaFolder) {
    return CatalogType.Schema
  }

  return CatalogType.Request
}

function collectDescendantIds(items: ApiMenuData[], rootId: string) {
  const result = new Set<string>([rootId])
  let hasNewNode = true

  while (hasNewNode) {
    hasNewNode = false

    for (const item of items) {
      if (item.parentId && result.has(item.parentId) && !result.has(item.id)) {
        result.add(item.id)
        hasNewNode = true
      }
    }
  }

  return [...result]
}

function normalizeParentId(parentId?: string) {
  if (!parentId || parentId === ROOT_CATALOG) {
    return undefined
  }

  return parentId
}

interface ParsedRecycleItem {
  deletedItem: ApiMenuData
  recycleId: string
}

function getProjectRecycleRows(projectId: string, recycleIds: string[]) {
  const normalizedRecycleIds = [...new Set(recycleIds)]

  if (normalizedRecycleIds.length === 0) {
    throw new Error('请选择回收项')
  }

  const rows = getRecycleItemsByIds({ projectId, ids: normalizedRecycleIds })

  if (rows.length !== normalizedRecycleIds.length) {
    throw new Error('回收项不存在')
  }

  return rows
}

function parseRecycleItems(rows: RecycleItemRow[]) {
  return rows.map((row) => {
    const deletedItem = parseJsonValue<ApiMenuData | null>(row.deleted_item_json, null)

    if (!deletedItem) {
      throw new Error('回收项数据损坏')
    }

    return {
      recycleId: row.id,
      deletedItem,
    } satisfies ParsedRecycleItem
  })
}

function sortParsedRecycleItems(items: ParsedRecycleItem[]) {
  const itemByDeletedId = new Map(items.map((item) => [item.deletedItem.id, item]))

  if (itemByDeletedId.size !== items.length) {
    throw new Error('回收项数据异常')
  }

  const depthCache = new Map<string, number>()
  const visiting = new Set<string>()

  const getDepth = (itemId: string): number => {
    const cachedDepth = depthCache.get(itemId)

    if (cachedDepth !== undefined) {
      return cachedDepth
    }

    if (visiting.has(itemId)) {
      throw new Error('回收项层级异常')
    }

    visiting.add(itemId)
    const parentId = itemByDeletedId.get(itemId)?.deletedItem.parentId
    const depth = parentId && itemByDeletedId.has(parentId) ? getDepth(parentId) + 1 : 0
    visiting.delete(itemId)
    depthCache.set(itemId, depth)

    return depth
  }

  return [...items].sort((left, right) => getDepth(left.deletedItem.id) - getDepth(right.deletedItem.id))
}

function resolveRestoreParentId(payload: {
  parentId?: string
  existingIds: Set<string>
  restoredIdMap: Map<string, string>
}) {
  if (!payload.parentId) {
    return undefined
  }

  const restoredParentId = payload.restoredIdMap.get(payload.parentId)

  if (restoredParentId) {
    return restoredParentId
  }

  return payload.existingIds.has(payload.parentId) ? payload.parentId : undefined
}

function restoreRecycleRows(projectId: string, recycleRows: RecycleItemRow[]) {
  const existingIds = new Set(listMenuItems(projectId).map(({ id }) => id))
  const restoredIdMap = new Map<string, string>()
  const parsedItems = sortParsedRecycleItems(parseRecycleItems(recycleRows))
  const recycleIdsToDelete: string[] = []
  let sortOrder = getMaxSortOrder(projectId)

  parsedItems.forEach(({ deletedItem, recycleId }) => {
    const restoreId = existingIds.has(deletedItem.id) ? randomUUID() : deletedItem.id
    const parentId = resolveRestoreParentId({
      parentId: normalizeParentId(deletedItem.parentId),
      existingIds,
      restoredIdMap,
    })

    sortOrder += 1
    insertMenuItem({
      projectId,
      id: restoreId,
      parentId,
      name: deletedItem.name,
      type: deletedItem.type,
      dataJson: deletedItem.data ? JSON.stringify(deletedItem.data) : undefined,
      sortOrder,
    })

    existingIds.add(restoreId)
    restoredIdMap.set(deletedItem.id, restoreId)
    recycleIdsToDelete.push(recycleId)
  })

  deleteRecycleItems({ projectId, ids: recycleIdsToDelete })
}

export function getProjectState(projectId: string): StateSnapshot {
  const menuRawList = listMenuItems(projectId).map(toMenuData)
  const recyleRawData = toRecycleData(projectId)
  const projectEnvironmentConfig = listProjectEnvironmentConfig(projectId)
  const projectEnvironments = projectEnvironmentConfig.environments

  return { menuRawList, recyleRawData, projectEnvironments, projectEnvironmentConfig }
}

export function createProjectMenuItem(projectId: string, menuData: ApiMenuData) {
  runInTransaction(() => {
    const sortOrder = getMaxSortOrder(projectId) + 1
    const parentId = normalizeParentId(menuData.parentId)
    const dataJson = menuData.data ? JSON.stringify(menuData.data) : undefined

    insertMenuItem({
      projectId,
      id: menuData.id,
      parentId,
      name: menuData.name,
      type: menuData.type,
      dataJson,
      sortOrder,
    })
  })

  return getProjectState(projectId)
}

export function patchProjectMenuItem(
  projectId: string,
  payload: Partial<ApiMenuData> & Pick<ApiMenuData, 'id'>,
) {
  runInTransaction(() => {
    const current = getMenuItem({ projectId, menuId: payload.id })

    if (!current) {
      throw new Error('菜单项不存在')
    }

    const currentData = parseJsonValue<Record<string, unknown>>(current.data_json, {})
    const nextData = {
      ...currentData,
      ...(payload.data as Record<string, unknown> | undefined),
      name: payload.name ?? current.name,
    }

    updateMenuItem({
      projectId,
      id: current.id,
      parentId: payload.parentId === undefined ? current.parent_id ?? undefined : normalizeParentId(payload.parentId),
      name: payload.name ?? current.name,
      type: payload.type ?? current.type,
      dataJson: Object.keys(nextData).length > 0 ? JSON.stringify(nextData) : undefined,
    })
  })

  return getProjectState(projectId)
}

function filterRedundantChildSelections(menuIds: string[], list: ApiMenuData[]) {
  const selected = new Set(menuIds)

  return menuIds.filter((id) => {
    let parentId = list.find((item) => item.id === id)?.parentId

    while (parentId) {
      if (selected.has(parentId)) {
        return false
      }

      parentId = list.find((item) => item.id === parentId)?.parentId
    }

    return true
  })
}

export function removeProjectMenuItem(payload: {
  projectId: string
  menuId: string
  actor: { id: string, username: string }
}) {
  runInTransaction(() => {
    const list = listMenuItems(payload.projectId).map(toMenuData)
    const target = list.find((item) => item.id === payload.menuId)

    if (!target) {
      return
    }

    const relatedIds = collectDescendantIds(list, payload.menuId)
    const relatedItems = list.filter((item) => relatedIds.includes(item.id))
    const expiresAt = Date.now() + RECYCLE_TTL_MS
    const creator = {
      id: payload.actor.id,
      name: payload.actor.username,
      username: payload.actor.username,
    }

    relatedItems.forEach((item) => {
      const catalogType = getCatalogType(item.type)
      const normalizedType = catalogType === CatalogType.Markdown ? CatalogType.Http : catalogType

      insertRecycleItem({
        projectId: payload.projectId,
        catalogType: normalizedType,
        creatorJson: JSON.stringify(creator),
        deletedItemJson: JSON.stringify(item),
        expiresAt,
      })
    })

    deleteMenuItems({ projectId: payload.projectId, ids: relatedIds })
  })

  return getProjectState(payload.projectId)
}

export function removeProjectMenuItemsBatch(payload: {
  projectId: string
  menuIds: string[]
  actor: { id: string, username: string }
}) {
  if (payload.menuIds.length === 0) {
    return getProjectState(payload.projectId)
  }

  runInTransaction(() => {
    const list = listMenuItems(payload.projectId).map(toMenuData)
    const knownIds = new Set(list.map((item) => item.id))
    const requested = payload.menuIds.filter((id) => knownIds.has(id))

    if (requested.length === 0) {
      return
    }

    const roots = filterRedundantChildSelections(requested, list)
    const allRelatedIds = new Set<string>()
    const itemsToRecycle: ApiMenuData[] = []

    for (const menuId of roots) {
      const relatedIds = collectDescendantIds(list, menuId)

      for (const rid of relatedIds) {
        if (allRelatedIds.has(rid)) {
          continue
        }

        allRelatedIds.add(rid)
        const item = list.find((i) => i.id === rid)

        if (item) {
          itemsToRecycle.push(item)
        }
      }
    }

    if (allRelatedIds.size === 0) {
      return
    }

    const expiresAt = Date.now() + RECYCLE_TTL_MS
    const creator = {
      id: payload.actor.id,
      name: payload.actor.username,
      username: payload.actor.username,
    }

    itemsToRecycle.forEach((item) => {
      const catalogType = getCatalogType(item.type)
      const normalizedType = catalogType === CatalogType.Markdown ? CatalogType.Http : catalogType

      insertRecycleItem({
        projectId: payload.projectId,
        catalogType: normalizedType,
        creatorJson: JSON.stringify(creator),
        deletedItemJson: JSON.stringify(item),
        expiresAt,
      })
    })

    deleteMenuItems({ projectId: payload.projectId, ids: [...allRelatedIds] })
  })

  return getProjectState(payload.projectId)
}

export function restoreProjectRecycleItem(projectId: string, recycleId: string) {
  return restoreProjectRecycleItems(projectId, [recycleId])
}

export function restoreProjectRecycleItems(projectId: string, recycleIds: string[]) {
  runInTransaction(() => {
    const recycleRows = getProjectRecycleRows(projectId, recycleIds)
    restoreRecycleRows(projectId, recycleRows)
  })

  return getProjectState(projectId)
}

export function removeProjectRecycleItems(projectId: string, recycleIds: string[]) {
  runInTransaction(() => {
    const recycleRows = getProjectRecycleRows(projectId, recycleIds)
    deleteRecycleItems({
      projectId,
      ids: recycleRows.map(({ id }) => id),
    })
  })

  return getProjectState(projectId)
}

export function moveProjectMenuItem(payload: {
  projectId: string
  dragKey: string
  dropKey: string
  dropPosition: -1 | 0 | 1
}) {
  runInTransaction(() => {
    const list = listMenuItems(payload.projectId).map(toMenuData)
    const dragIndex = list.findIndex((item) => item.id === payload.dragKey)
    const dropIndex = list.findIndex((item) => item.id === payload.dropKey)

    if (dragIndex < 0 || dropIndex < 0) {
      throw new Error('移动对象不存在')
    }

    const dragItem = list[dragIndex]
    const dropItem = list[dropIndex]

    if (getTypeGroup(dragItem.type) !== getTypeGroup(dropItem.type)) {
      throw new Error('不允许跨分组移动')
    }

    const [movingItem] = list.splice(dragIndex, 1)
    let targetIndex = payload.dropPosition === -1 ? dropIndex : dropIndex + 1

    if (dragIndex < targetIndex) {
      targetIndex -= 1
    }

    list.splice(targetIndex, 0, movingItem)

    const nextParentId = payload.dropPosition === 0 && isMenuFolder(dropItem.type)
      ? dropItem.id
      : dropItem.parentId

    list.forEach((item, index) => {
      const updatedParentId = item.id === movingItem.id ? normalizeParentId(nextParentId) : item.parentId

      updateMenuSortOrder({
        projectId: payload.projectId,
        id: item.id,
        parentId: updatedParentId,
        sortOrder: index + 1,
      })
    })
  })

  return getProjectState(payload.projectId)
}

export function createDefaultApiDetails(menuName: string) {
  return {
    id: randomUUID(),
    name: menuName,
    method: 'GET',
    status: 'developing',
    serverId: SERVER_INHERIT,
    auth: { type: 'none' as const },
    responses: [],
  }
}
