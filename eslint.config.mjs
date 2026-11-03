// ESLint for the IDE and the operator app (npm run lint).
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// A runtime with security.mode "login" answers 401 to any API call without
// the token, and the screen just stays empty. API calls go through apiFetch
// (both apps) or carry authHeader / Authorization in the call itself.
const apiToken = {
  meta: {
    type: "problem",
    messages: { bare: "API call without the login token: use apiFetch, or pass authHeader(...)." },
    schema: [],
  },
  create(context) {
    const src = context.sourceCode;
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "fetch") return;
        const url = node.arguments[0] ? src.getText(node.arguments[0]) : "";
        if (!url.includes("/api/v1/") || /\/api\/v1\/(auth\/|alive)/.test(url)) return;
        if (/authHeader|Authorization/.test(src.getText(node))) return;
        context.report({ node, messageId: "bare" });
      },
    };
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "cmd/speths-screens/ui/**",
      "packages/shared-types/src/project.ts", // generated from schema.json
    ],
  },
  {
    files: ["packages/*/src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks, local: { rules: { "api-token": apiToken } } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "local/api-token": "error",
      // Unused names prefixed with _ are deliberate.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
);
