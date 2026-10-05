import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("mantiene los tipos y enums de la proyección alineados al esquema de la app", () => {
  const root = readFileSync(resolve(__dirname, "../../../../prisma/schema.prisma"), "utf8");
  const admin = readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
  const blocks = (text: string, kind: string) => new Map([...text.matchAll(new RegExp(`^${kind} (\\w+) \\{([\\s\\S]*?)^\\}`, "gm"))].map(match => [match[1], match[2]]));
  const rootModels = blocks(root, "model");
  for (const [name, body] of blocks(admin, "model")) {
    const fields = (value: string) => new Map([...value.matchAll(/^\s*(\w+)\s+(\w+(?:\[\]|\?)?)/gm)].map(match => [match[1], match[2]]));
    expect(rootModels.has(name), `modelo ${name}`).toBe(true);
    const original = fields(rootModels.get(name)!);
    for (const [field, type] of fields(body)) expect(original.get(field), `${name}.${field}`).toBe(type);
  }
  const rootEnums = blocks(root, "enum");
  for (const [name, body] of blocks(admin, "enum")) expect(body.trim().split(/\s+/), name).toEqual(rootEnums.get(name)?.trim().split(/\s+/));
});
