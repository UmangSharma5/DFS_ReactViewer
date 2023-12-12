module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: ['eslint:recommended', 'plugin:react/recommended'],
  overrides: [
    // {
    //   env: {
    //     node: true,
    //   },
    //   files: ['.eslintrc.{js,cjs}'],
    //   parserOptions: {
    //     sourceType: 'script',
    //   },
    // },
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    emacFeatures: {
      jsx: true,
    },
  },
  plugins: ['react'],
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
    eqeqeq: 'error',
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error',
    // "@typescript-eslint/no-unused-vars": "error"
  },
};
