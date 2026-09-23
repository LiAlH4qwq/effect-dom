import { defineConfig, type Plugin } from "rolldown"
import { dts } from "rolldown-plugin-dts"

const input = {
    index: "src/index.ts",
    Types: "src/Types.ts",
    Errors: "src/Errors.ts",
    Doc: "src/Doc.ts",
    Elem: "src/Elem.ts",
    Mut: "src/Mut.ts",
    Wait: "src/Wait.ts",
    Interact: "src/Interact.ts",
}

const external = [/^effect(\/.*)?$/]

const cjsInterop = (): Plugin => ({
    name: "cjs-interop",
    generateBundle(outputOptions) {
        if (outputOptions.dir?.endsWith("cjs")) {
            this.emitFile({
                type: "asset",
                fileName: "package.json",
                source: '{\n    "type": "commonjs"\n}\n',
            })
        }
    },
})

export default defineConfig([
    {
        input,
        external,
        platform: "neutral",
        output: [
            { dir: "dist/esm", format: "es", entryFileNames: "[name].js" },
            { dir: "dist/cjs", format: "cjs", entryFileNames: "[name].js" },
        ],
        plugins: [cjsInterop()],
    },
    {
        input,
        external,
        platform: "neutral",
        output: { dir: "dist/dts", format: "es" },
        plugins: [dts({ emitDtsOnly: true })],
    },
])
