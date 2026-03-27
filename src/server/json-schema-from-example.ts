import { SchemaType, type JsonSchema } from '@/components/JsonSchema'

type NonRefJsonSchema = Exclude<JsonSchema, { type: SchemaType.Refer }>

export function inferJsonSchemaFromExample(value: unknown): JsonSchema {
  if (Array.isArray(value)) {
    const firstDefined = value.find((item) => item !== undefined)

    return {
      type: SchemaType.Array,
      items: inferJsonSchemaFromExample(firstDefined ?? '') as NonRefJsonSchema,
    }
  }

  if (value === null) {
    return { type: SchemaType.Null }
  }

  if (typeof value === 'boolean') {
    return { type: SchemaType.Boolean }
  }

  if (typeof value === 'number') {
    return { type: Number.isInteger(value) ? SchemaType.Integer : SchemaType.Number }
  }

  if (value && typeof value === 'object') {
    return {
      type: SchemaType.Object,
      properties: Object.entries(value as Record<string, unknown>).map(([name, fieldValue]) => {
        return {
          ...inferJsonSchemaFromExample(fieldValue),
          name,
        }
      }),
    }
  }

  return { type: SchemaType.String }
}
