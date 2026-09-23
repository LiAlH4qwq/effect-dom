import { readdirSync, readFileSync } from "node:fs"
import ts from "typescript"

const SRC = "src"

const MUTATING_METHODS = new Set([
    "forEach",
    "push",
    "pop",
    "shift",
    "unshift",
    "splice",
    "sort",
    "reverse",
    "fill",
    "copyWithin",
])

const describe = (sourceFile, node) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
    )
    return `${sourceFile.fileName}:${line + 1}:${character + 1}`
}

const checkNode = (sourceFile, node, report) => {
    if (ts.isVariableDeclarationList(node)) {
        if (
            (node.flags & ts.NodeFlags.Let) !== 0 ||
            (node.flags & ts.NodeFlags.Var) !== 0
        ) {
            report(`${describe(sourceFile, node)}  mutable binding (use const)`)
        }
    }
    if (
        ts.isForStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node)
    ) {
        report(
            `${describe(sourceFile, node)}  for loop (use map/reduce/flatMap)`,
        )
    }
    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
        report(
            `${describe(sourceFile, node)}  while/do loop (use recursion or Stream)`,
        )
    }
    if (ts.isTryStatement(node)) {
        report(`${describe(sourceFile, node)}  try/catch (use Effect errors)`)
    }
    if (ts.isThrowStatement(node)) {
        report(`${describe(sourceFile, node)}  throw (use Effect errors)`)
    }
    if (ts.isDeleteExpression(node)) {
        report(`${describe(sourceFile, node)}  delete (transform instead)`)
    }
    if (ts.isNonNullExpression(node)) {
        report(
            `${describe(sourceFile, node)}  non-null assertion (narrow properly)`,
        )
    }
    if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "Error"
    ) {
        report(
            `${describe(sourceFile, node)}  new Error (use Data.TaggedError)`,
        )
    }
    if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
    ) {
        const { expression } = node
        if (MUTATING_METHODS.has(expression.name.text)) {
            report(
                `${describe(sourceFile, node)}  .${expression.name.text}() (transform instead)`,
            )
        }
        if (
            expression.name.text === "assign" &&
            ts.isIdentifier(expression.expression) &&
            expression.expression.text === "Object"
        ) {
            report(`${describe(sourceFile, node)}  Object.assign (use spread)`)
        }
        if (
            expression.name.text === "gen" &&
            ts.isIdentifier(expression.expression) &&
            expression.expression.text === "Effect"
        ) {
            report(
                `${describe(sourceFile, node)}  Effect.gen (use combinators)`,
            )
        }
    }
}

const visit = (sourceFile, report) => {
    const walk = node => {
        checkNode(sourceFile, node, report)
        ts.forEachChild(node, walk)
    }
    walk(sourceFile)
}

const sourceFiles = readdirSync(SRC)
    .filter(name => name.endsWith(".ts"))
    .map(name => `${SRC}/${name}`)

const findings = sourceFiles.flatMap(fileName => {
    const text = readFileSync(fileName, "utf8")
    const sourceFile = ts.createSourceFile(
        fileName,
        text,
        ts.ScriptTarget.ESNext,
        true,
    )
    const reported = []
    visit(sourceFile, message => reported.push(message))
    return reported
})

if (findings.length > 0) {
    console.error(
        "Functional/safety audit failed:\n" +
            findings.map(finding => `  - ${finding}`).join("\n"),
    )
    process.exit(1)
}

console.log(`Functional/safety audit passed (${sourceFiles.length} files).`)
