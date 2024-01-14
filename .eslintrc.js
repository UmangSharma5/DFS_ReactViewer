module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    // 'eslint:recommended',
    // 'plugin:react/recommended',
    // 'plugin:react/jsx-runtime',
  ],
  parser: '@babel/eslint-parser',
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
    requireConfigFile: false,
    sourceType: 'module',
    emacFeatures: {
      jsx: true,
    },
    babelOptions: {
      presets: ['@babel/preset-react'],
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  //  plugins: ['react'],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: 'error',
    // 'react/jsx-uses-react': 'error',
    // 'react/jsx-uses-vars': 'error',
    // 'react/prop-types': 'off',
    // 'react/jsx-key': 'off',
    // 'react/no-prototype-builtins': 'off',
    // "@typescript-eslint/no-unused-vars": "error"
  },
};
