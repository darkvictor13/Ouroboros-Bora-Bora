import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // A regra continua sendo erro; o que muda é como se declara "não usar
      // isto é de propósito", para não haver incentivo a inventar um uso falso.
      "@typescript-eslint/no-unused-vars": ["error", {
        // `const { id, ...resto } = obj` é como se omite um campo em JS. Sem
        // isto, o idioma vira erro e o jeito de calar o lint seria pior que ele.
        ignoreRestSiblings: true,
        // Um `_` à frente marca o descarte deliberado — um parâmetro que existe
        // só para alcançar o seguinte, por exemplo.
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
];

export default eslintConfig;
