// JS escape hatch demo (M5): a hand-rolled structural validator against the API's own
// `/openapi.json` — proves there's a real workaround for "schema/contract validation" (SPEC §16
// parking-lot P#3, "OpenAPI/contract") but no declarative primitive for it. Deliberately minimal
// (no ajv/json-schema dependency): just enough to check `type`/`required`/`nullable` for this
// suite's own generated schemas, not a general-purpose validator.
const BASE_URL = 'http://localhost:4001';

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  nullable?: boolean;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validate(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
  if (value === null) {
    if (!schema.nullable) errors.push(`${path}: got null, schema doesn't allow it`);
    return;
  }
  if (schema.type && typeOf(value) !== schema.type) {
    errors.push(`${path}: expected type "${schema.type}", got "${typeOf(value)}"`);
    return;
  }
  if (schema.properties) {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}.${key}: required field missing`);
    }
    for (const [key, subSchema] of Object.entries(schema.properties)) {
      if (key in obj) validate(obj[key], subSchema, `${path}.${key}`, errors);
    }
  }
}

// Throws (rather than returning a boolean) so calling this *is* the assertion: tflw's step
// executor already fails the test cleanly on a thrown error from a `use`d call, so there's no
// separate `expect` needed — same mechanism every other JS-escape-hatch helper in this suite
// relies on to signal failure.
export async function assertMatchesSchema(
  _ctx: { env: NodeJS.ProcessEnv },
  schemaName: string,
  body: unknown,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/openapi.json`);
  const doc = (await res.json()) as { components: { schemas: Record<string, JsonSchema> } };
  const schema = doc.components.schemas[schemaName];
  if (!schema) throw new Error(`schema "${schemaName}" not found in /openapi.json`);

  const errors: string[] = [];
  validate(body, schema, schemaName, errors);
  if (errors.length > 0) {
    throw new Error(`response does not match schema "${schemaName}": ${errors.join('; ')}`);
  }
  return `matches ${schemaName}`;
}
