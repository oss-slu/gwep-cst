import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "dist-request-fixture/",
      "coverage/",
      "test-results/",
      "playwright-report/",
      "lighthouse-reports/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Browser code and Node code (scripts, Node-side tests) are separate
        // TypeScript projects; both get type-aware lint rules.
        project: ["./tsconfig.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Node scripts run in CI; declare the Node globals they use.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
  },
  {
    // Build tooling (validate-content, CMS generation) must never reach the
    // viewer bundle, so browser code may not import from scripts/.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/scripts/**"],
              message:
                "Code in src/ runs in the browser; it must not import build scripts.",
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            "Content is data: render it as text. See the security rules in AGENTS.md.",
        },
      ],
    },
  },
);
