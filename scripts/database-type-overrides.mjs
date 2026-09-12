import ts from "typescript";

// Existing RPC contract: nullable SQL outputs are not represented by the CLI.
// Keep this allowlist limited to list_installations; all other drift survives.
const nullableFields = [
  "application_host",
  "archived_at",
  "hosting_region",
  "next_cursor_display_name",
  "next_cursor_id",
];

export function applyDatabaseTypeOverrides(source) {
  const file = ts.createSourceFile(
    "database.types.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (file.parseDiagnostics.length) {
    throw new Error("Generated database types contain invalid TypeScript.");
  }
  const databases = file.statements.filter(
    (node) => ts.isTypeAliasDeclaration(node) && node.name.text === "Database",
  );
  if (databases.length !== 1) throw new Error("Expected one Database type.");
  let type = databases[0].type;
  for (const name of ["public", "Functions", "list_installations", "Returns"]) {
    type = member(type, name);
  }
  if (!ts.isArrayTypeNode(type)) {
    throw new Error("Expected list_installations.Returns to be an array.");
  }
  const edits = nullableFields.map((name) => {
    const field = member(type.elementType, name);
    const text = field.getText(file).replace(/\s+/g, "");
    if (text !== "string" && text !== "string|null") {
      throw new Error(
        `Unexpected generated type for list_installations.${name}.`,
      );
    }
    return { start: field.getStart(file), end: field.end };
  });
  for (const { start, end } of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, start) + "string | null" + source.slice(end);
  }
  return source;
}

function member(type, name) {
  const matches = ts.isTypeLiteralNode(type)
    ? type.members.filter(
        (node) =>
          ts.isPropertySignature(node) &&
          (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
          node.name.text === name,
      )
    : [];
  if (matches.length !== 1 || !matches[0].type || matches[0].questionToken) {
    throw new Error(`Expected one required generated property: ${name}.`);
  }
  return matches[0].type;
}
