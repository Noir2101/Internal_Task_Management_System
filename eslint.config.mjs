// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  // Cổng cơ học 1 — domain purity (docs/07 §2.1). Vi phạm = lỗi build.
  {
    files: ['src/tasks/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@prisma/client', '@prisma/*'], message: 'domain không được biết Prisma — map ở adapter.' },
          { group: ['@nestjs/*'],                    message: 'domain thuần, không phụ thuộc framework.' },
          { group: ['**/infrastructure/**'],         message: 'mũi tên chỉ vào trong; domain không biết infrastructure.' },
        ],
      }],
    },
  },
  {
    files: ['src/stats/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@prisma/client'], message: 'Stats chỉ đọc qua TaskQueryPort, không Prisma trực tiếp.' },
        ],
      }],
    },
  },
);
