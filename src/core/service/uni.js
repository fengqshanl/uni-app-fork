import apis from '../../../lib/apis'
import {
  wrapper,
  wrapperUnimplemented
} from 'uni-helpers/api'
import {
  promisify
} from 'uni-helpers/promise'

import api from 'uni-service-api'

export const uni = Object.create(null)

/**
 * promise 加载 api 并 挂载 在 uni 对象上面并导出
 *
 * 包含所有平台通用的 api 与 编译目标平台的专属 api
 *
 *  */

apis.forEach(name => {
  if (api[name]) {
    uni[name] = promisify(name, wrapper(name, api[name]))
  } else {
    uni[name] = wrapperUnimplemented(name)
  }
})
