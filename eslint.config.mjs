import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  // Con la base asíncrona, olvidar un `await` en una escritura es un error silencioso (la operación se pierde o se hace tarde): se prohíbe en el código del sitio y los scripts.
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: { "@typescript-eslint/no-floating-promises": "error", "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }] },
  },
  { ignores: [".next*/**", ".local/**", "playwright-report/**", "test-results/**", "node_modules/**", "referencias/**", "next-env.d.ts"] },
];
export default config;
