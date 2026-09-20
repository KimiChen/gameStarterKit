module.exports = {
    env: {
        node: true,
        es2022: true,
    },
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'airbnb-typescript', 'prettier'],
    parserOptions: {
        ecmaVersion: 'latest',
        parser: '@typescript-eslint/parser',
        sourceType: 'module',
        project: './tsconfig.eslintrc.json',
    },
    plugins: ['@typescript-eslint', 'import'],

    /*
     * "off" 或 0    ==>  关闭规则
     * "warn" 或 1   ==>  打开的规则作为警告（不影响代码执行）
     * "error" 或 2  ==>  规则作为一个错误（代码不能执行，界面报错）
     */
    rules: {
        // eslint（https://eslint.bootcss.com/docs/rules/）
        // 要求使用 let 或 const 而不是 var
        'no-var': 'error',
        'no-void': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': [
            'error',
            {
                checksVoidReturn: {
                    arguments: false,
                    attributes: false,
                },
            },
        ],
        // 不允许多个空行
        'no-multiple-empty-lines': [
            'warn',
            {
                max: 1,
            },
        ],
        // 禁用eslint空格规范
        indent: 'off',
        '@typescript-eslint/lines-between-class-members': 'off',
        // 单行最大字符数
        'max-len': ['warn', { code: 140, ignoreUrls: true }],
        'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
        'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
        // 禁止空余的多行
        'no-unexpected-multiline': 'error',
        // 禁止不必要的转义字符
        'no-useless-escape': 'off',
        // 不强制要求文件导入时需要写文件后缀
        'import/extensions': 'off',
        // 允许模块间循环引用
        'import/no-cycle': 'off',
        // 允许使用不受限制的语法结构
        'no-restricted-syntax': 'off',
        // 允许不必要的解构赋值
        'prefer-destructuring': 'off',
        // 允许使用非点的方式访问对象属性
        'dot-notation': 'off',
        // 允许导出时不必须使用默认导出
        'import/prefer-default-export': 'off',
        // 允许在变量名中使用下划线
        'no-underscore-dangle': 'off',
        // 允许位运算
        'no-bitwise': 'off',
        // 要求在变量声明时进行初始化
        'init-declarations': 'off',
        // 禁用句尾分号
        semi: ['error', 'never'],
        'import/no-extraneous-dependencies': [
            'error',
            {
                devDependencies: true,
                optionalDependencies: true,
                peerDependencies: true,
            },
        ],
        'react/jsx-filename-extension': 'off',
        'no-async-promise-executor': 'off',
        'no-throw-literal': 'off',
        // typeScript (https://typescript-eslint.io/rules)
        // 禁止定义未使用的变量
        '@typescript-eslint/no-unused-vars': [
            'warn',
            {
                argsIgnorePattern: '^_',
                argsIgnorePattern: '^res',
                caughtErrorsIgnorePattern: '^_',
                destructuredArrayIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            },
        ],
        // 禁止使用 @ts-ignore
        '@typescript-eslint/prefer-ts-expect-error': 'off',
        // 禁止使用 any 类型
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        // 禁止使用自定义 TypeScript 模块和命名空间。
        '@typescript-eslint/no-namespace': 'off',
        // 禁止强制在语句的末尾使用分号
        '@typescript-eslint/semi': 'off',
        // 禁止在变量、函数等在定义之前就使用它们
        '@typescript-eslint/no-use-before-define': [
            'error',
            {
                functions: false,
                classes: false,
                variables: false,
                allowNamedExports: false,
                enums: false,
                ignoreTypeReferences: true,
                typedefs: false,
            },
        ],
        // 4个空格缩进
        '@typescript-eslint/indent': 'off',
        // 变量名命名规则
        // 'camelCase': 驼峰命名法，例如 myVariableName。
        // 'PascalCase': 大驼峰命名法，例如 MyClass。
        // 'snake_case': 下划线命名法，例如 my_variable_name。
        // 'UPPER_CASE': 全大写下划线命名法，例如 MY_CONSTANT.
        '@typescript-eslint/naming-convention': [
            'error',
            {
                selector: 'variable',
                format: ['camelCase', 'UPPER_CASE', 'snake_case', 'PascalCase'],
            },
        ],
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/ban-types': 'off', // 禁用 @typescript-eslint/ban-types 规则Function
        '@typescript-eslint/no-useless-constructor': 'off',
        '@typescript-eslint/no-throw-literal': 'off',
        '@typescript-eslint/no-extra-semi': 'off',
        '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
        '@typescript-eslint/no-this-alias': 'off',
    },
}
