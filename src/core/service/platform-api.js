// 拿到 core-service-api 下面所有 js 文件的导出
import baseApi from 'uni-core/service/api'
// 拿到 core-platforms-platform-service-api 下面所有 js 文件的导出
import platformApi from 'uni-invoke-api'

export default Object.assign(Object.create(null), baseApi, platformApi)
