const path = require('path')
const webpack = require('webpack')

const resolve = dir => path.resolve(__dirname, '../', dir)

const pkg = require('../package.json')

const externals = {}

if (process.env.UNI_VIEW !== 'true') {
  // 排除打包范围
  externals.vue = {
    commonjs: 'vue',
    commonjs2: 'vue',
    root: 'Vue'
  }
  externals['vue-router'] = {
    commonjs: 'vue-router',
    commonjs2: 'vue-router',
    root: 'VueRouter'
  }
  externals['@dcloudio/uni-i18n'] = {
    commonjs: '@dcloudio/uni-i18n',
    commonjs2: '@dcloudio/uni-i18n',
    root: '@dcloudio/uni-i18n'
  }
}

const alias = {
  '@dcloudio': resolve('packages'),
  'uni-core': resolve('src/core'),
  'uni-view': resolve('src/core/view'),
  'uni-service': resolve('src/core/service'),
  'uni-shared': resolve('src/shared'),
  'uni-mixins': resolve('src/core/view/mixins'),
  'uni-helpers': resolve('src/core/helpers'),
  'uni-platform': resolve('src/platforms/' + process.env.UNI_PLATFORM),
  // tree shaking
  'uni-components': resolve('src/core/view/components'),
  'uni-invoke-api': resolve('src/platforms/' + process.env.UNI_PLATFORM + '/service/api'),
  'uni-service-api': resolve('src/core/service/platform-api'),
  'uni-api-protocol': resolve('src/core/helpers/protocol'),
  'uni-api-subscribe': resolve('src/core/view/bridge/subscribe/api/index'),
  // h5 components
  'uni-h5-app-components': resolve('src/platforms/h5/components/app/popup/index'),
  'uni-h5-app-mixins': resolve('src/platforms/h5/components/app/popup/mixins/index'),
  'uni-h5-system-routes': resolve('src/platforms/h5/components/system-routes/index')
}

const provides = {
  console: [resolve('src/core/helpers/console'), 'default'],
  UniViewJSBridge: [resolve('src/core/view/bridge/index')],
  UniServiceJSBridge: [resolve('src/core/service/bridge/index')]
}
if (process.env.UNI_VIEW) { // 方便调试
  delete provides.console
}

if (process.env.UNI_VIEW === 'true') {
  alias.vue$ = resolve('packages/vue-cli-plugin-uni/packages/h5-vue/dist/vue.runtime.esm.js')
}

module.exports = {
  mode: 'production',
  devtool: false,
  externals,
  resolve: {
    alias
  },
  module: {
    rules: []
  },
  plugins: [
    // 该插件允许在编译时 将代码中的 指定变量 替换为 其他值 或 表达式； 常用于 区分 开发环境 与 生产环境
    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(pkg.version),
      __PLATFORM__: JSON.stringify(process.env.UNI_PLATFORM),
      __VIEW__: JSON.stringify(!!process.env.UNI_VIEW)
    }),
    // 在所有模块中 自动执行 import 或 require 来引入指定模块， 从而避免每个模块都需要重复引入相同模块
    new webpack.ProvidePlugin(provides)
  ]
}
