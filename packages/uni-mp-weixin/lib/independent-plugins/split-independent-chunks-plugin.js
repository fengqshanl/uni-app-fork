const GraphHelpers = require('webpack/lib/GraphHelpers');
const { normalizePath } = require('@dcloudio/uni-cli-shared');
const getSplitChunks = require('@dcloudio/vue-cli-plugin-uni/lib/split-chunks');
const path = require('path');

const mainPath = normalizePath(path.resolve(process.env.UNI_INPUT_DIR, 'main.'));
const mainPkgName = 'mainPkg';

function getAllEntryPointOfChunkGroup (chunkGroup, entryPointSet) {
    if (chunkGroup.isInitial()) {
        return entryPointSet.add(chunkGroup);
    }

    const parentChunkGroups = [...chunkGroup.parentsIterable];
    parentChunkGroups.forEach(parentChunkGroup => getAllEntryPointOfChunkGroup(parentChunkGroup, entryPointSet));
}

function getChunkToEntryPointsMap (allChunks) {
    const chunkToEntryPointsMap = new Map();
    allChunks.forEach(chunkItem => {
        const chunkGroups = [...chunkItem.groupsIterable];
        const tmpEntryPointSet = new Set();
        chunkToEntryPointsMap.set(chunkItem, tmpEntryPointSet);
        chunkGroups.forEach(chunkGroup => {
            getAllEntryPointOfChunkGroup(chunkGroup, tmpEntryPointSet);
        });
    });
    return chunkToEntryPointsMap;
}

function baseTest (module) {
    if (module.type === 'css/mini-extract') {
        return false;
    }
    if (module.resource) {
        const resource = normalizePath(module.resource);
        if (
            resource.indexOf('.vue') !== -1 ||
            resource.indexOf('.nvue') !== -1 ||
            resource.indexOf(mainPath) === 0 // main.js
        ) {
            return false;
        }
    }
    return true;
}

class SplitHandler {
    constructor (chunks = [], compilation, cacheGroups, chunkFilter, removeModuleFromChunkFilter = () => true) {
        this.chunks = chunks || [];
        this.chunkFilter = chunkFilter;
        this.cacheGroups = cacheGroups;
        this.compilation = compilation;
        this.removeModuleFromChunkFilter = removeModuleFromChunkFilter;

        this.chunksInfoMap = new Map();
    }

    addModuleToChunksInfoMap (module, chunks, newChunkName) {
        let info = this.chunksInfoMap.get(newChunkName);
        if (!info) {
            info = {
                modules: new Set(),
                chunks: new Set(),
            };
            this.chunksInfoMap.set(newChunkName, info);
        }
        info.modules.add(module);
        chunks.forEach(chunk => info.chunks.add(chunk));
    }

    checkTest (module, test) {
        if (typeof test === 'function') {
            if (test(module, module.getChunks())) {
                return true;
            }
        } else if (test instanceof RegExp) {
            if (module.nameForCondition && test.test(module.nameForCondition())) {
                return true;
            }
            for (const chunk of module.getChunks()) {
                if (chunk.name && test.test(chunk.name)) {
                    return true;
                }
            }
        }
        return false;
    }

    getHitCacheGroups (module) {
        const hitCacheGroups = [];
        const cacheGroups = this.cacheGroups;
        for (const key of Object.keys(cacheGroups)) {
            const cacheInfo = cacheGroups[key];
            if (!cacheInfo) {
                continue;
            }
            if (this.checkTest(module, cacheInfo.test)) {
                hitCacheGroups.push({ newChunkName: cacheInfo.name, priority: cacheInfo.priority || 0 });
            }
        }
        if (hitCacheGroups.length) {
            return hitCacheGroups.sort((b, a) => a.priority - b.priority)[0];
        }
        return null;
    }

    start () {
        const allModulesSet = new Set();
        this.chunks.forEach(chunk => {
            chunk.getModules().forEach(module => allModulesSet.add(module));
        });
        this.splitHandler([...allModulesSet]);
    }

    filter (module) {
        // ??????chunks???this.chunks???????????????
        const filterOne = this.chunks.filter(targetChunk => module.chunksIterable.has(targetChunk)) || [];
        // ??????uniapp?????????????????????split-chunks??????
        return filterOne.filter(this.chunkFilter);
    }

    splitHandler (allModulesUsedByIndependent) {
        // ?????????????????????????????????????????????????????????cacheGroup
        // ??????????????????????????????????????????????????????newChunk???
        for (const module of allModulesUsedByIndependent) {
            const hitGroup = this.getHitCacheGroups(module);
            if (!hitGroup) {
                continue;
            }
            this.addModuleToChunksInfoMap(module, this.filter(module), hitGroup.newChunkName);
        }

        // ?????? chunksInfoMap
        for (const [chunkName, newChunkInfo] of this.chunksInfoMap) {
            const newChunk = this.compilation.addChunk(chunkName);
            newChunk.chunkReason = 'split chunk for independent';
            for (const module of newChunkInfo.modules) {
                GraphHelpers.connectChunkAndModule(newChunk, module);
                [...newChunkInfo.chunks].forEach(chunk => {
                    if (this.removeModuleFromChunkFilter(chunk)) {
                        chunk.removeModule(module);
                        chunk.split(newChunk);
                    }
                });
            }
        }
    }
}

class SplitIndependentChunksPlugin {
    generateCacheGroups () {
        const cacheGroups = {};
        Object.keys(process.UNI_SUBPACKAGES).forEach(root => {
            const pkgInfo = process.UNI_SUBPACKAGES[root];
            if (pkgInfo.independent) {
                cacheGroups[root] = {
                    [root + '/commonsVendor']: {
                        test: /[\\/]node_modules[\\/]/,
                        minSize: 0,
                        minChunks: 1,
                        name: normalizePath(path.join(root, 'common/library')),
                        priority: 2,
                        chunks: 'all',
                    },
                    [root + '/commons']: {
                        priority: 1,
                        name: normalizePath(path.join(root, 'common/vendor')),
                        test: (module) => {
                            if (!baseTest(module)) {
                                return false;
                            }
                            return true;
                        },
                    },
                };
            }
        });

        const splitChunkConfig = getSplitChunks();
        cacheGroups[mainPkgName] = splitChunkConfig.cacheGroups;
        return { cacheGroups, chunkFilter: splitChunkConfig.chunks };
    }

    apply (compiler) {
        compiler.hooks.thisCompilation.tap('SplitIndependentChunksPlugin', compilation => {
            compilation.hooks.optimizeChunksAdvanced.tap('SplitIndependentChunksPlugin', chunks => {
                try {
                    const independentPkgRoot = Object.values(process.UNI_SUBPACKAGES).filter(rootInfo => rootInfo.independent).map(rootInfo => rootInfo.root);
                    const allPkgRootMap = {};
                    const mainPkgChunks = [];
                    for (const chunk of chunks) {
                        const chunkName = chunk.name;
                        if (!chunkName) {
                            continue;
                        }
                        const root = independentPkgRoot.find(root => chunkName.startsWith(root));
                        if (!root) {
                            mainPkgChunks.push(chunk);
                            continue;
                        }
                        if (!allPkgRootMap[root]) {
                            allPkgRootMap[root] = [];
                        }
                        allPkgRootMap[root].push(chunk);
                    }

                    const { cacheGroups, chunkFilter } = this.generateCacheGroups(compiler);
                    // ??????chunk?????????entryPoint
                    const chunkToEntryPointsMap = getChunkToEntryPointsMap(compilation.chunks);
                    const allChunksUsedByIndependentMap = {};
                    for (const pkgRoot in allPkgRootMap) {
                        if (!allChunksUsedByIndependentMap[pkgRoot]) {
                            allChunksUsedByIndependentMap[pkgRoot] = new Set();
                        }

                        for (const [chunkItem, entryPointSet] of chunkToEntryPointsMap) {
                            const filter = entryPoint => entryPoint.name.startsWith(pkgRoot);
                            const referenceByPkgRoot = [...entryPointSet].find(filter);
                            // ??????chunk??????????????????????????????????????????????????????
                            // uniapp???entry: main.js + page.vue
                            if (referenceByPkgRoot) {
                                allChunksUsedByIndependentMap[pkgRoot].add(chunkItem);
                            }
                        }
                    }

                    // ?????????????????????
                    for (const pkgRoot in allPkgRootMap) {
                        const chunksOfIndependentPkg = allPkgRootMap[pkgRoot];
                        // ????????????????????????????????????js????????????????????? pkgRoot/vendor.js ???
                        const allChunksUsedByIndependent = [...allChunksUsedByIndependentMap[pkgRoot]];
                        // ?????????????????????????????????chunks?????????chunks + ??????chunks(???????????????????????????)
                        const outSideChunks = [];
                        allChunksUsedByIndependent.forEach(chunkItem => {
                            if (!chunksOfIndependentPkg.includes(chunkItem)) {
                                outSideChunks.push(chunkItem);
                            }
                        });

                        new SplitHandler([...allChunksUsedByIndependent], compilation, cacheGroups[pkgRoot], chunkFilter, (chunk) => {
                            if (outSideChunks.includes(chunk)) {
                                return false;
                            }
                            return true;
                        }).start();
                    }
                    // ??????????????????????????????
                    new SplitHandler(mainPkgChunks, compilation, cacheGroups[mainPkgName], chunkFilter).start();
                } catch (e) {
                    console.error('independent.error', 'SplitIndependentChunksPlugin', e);
                }
            });
        });
    }
}

module.exports = SplitIndependentChunksPlugin;
