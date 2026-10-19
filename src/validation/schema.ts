/**
 * Loads docs/openapi.yaml (the single source of truth for response structure) and compiles
 * its component schemas with ajv (JSON Schema 2020-12, as used by OpenAPI 3.1).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020, { ErrorObject, ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const OPENAPI_PATH = path.resolve(__dirname, '..', '..', 'docs', 'openapi.yaml');
const SCHEMA_ID = 'activity-ranking-openapi';

let ajv: Ajv2020 | undefined;
const compiled = new Map<string, ValidateFunction>();

function schemaValidator(name: string): ValidateFunction {
  if (!ajv) {
    const doc = parse(readFileSync(OPENAPI_PATH, 'utf8')) as { components: { schemas: object } };
    ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
    addFormats(ajv, ['date']);
    // OpenAPI keeps schemas under components/schemas; expose them to ajv as $defs, rewriting
    // the document-local refs ("#/components/schemas/X" -> "#/$defs/X").
    const defs = JSON.parse(
      JSON.stringify(doc.components.schemas).replaceAll('#/components/schemas/', '#/$defs/'),
    );
    ajv.addSchema({ $id: SCHEMA_ID, $defs: defs });
  }
  let fn = compiled.get(name);
  if (!fn) {
    fn = ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/${name}` });
    compiled.set(name, fn);
  }
  return fn;
}

const describe = (errors: ErrorObject[] | null | undefined): string[] =>
  (errors ?? []).map(
    (e) =>
      `schema: ${e.instancePath || '(root)'} ${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
  );

/** Validate a value against a named component schema; returns human-readable problems. */
export function validateAgainstSchema(name: string, value: unknown): string[] {
  const fn = schemaValidator(name);
  return fn(value) ? [] : describe(fn.errors);
}
