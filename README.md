# cicd-starter

一个刻意保持最小、但**真的能跑通**的 Node + TypeScript 项目，用来演示 GitHub Actions 的自动构建与测试。

之所以做成模板而不是只丢一个 YAML：CI 流水线的每一步都得对应项目里真实存在的脚本，
否则流水线写出来就是装饰品。

## 目录结构

```
.
├── .github/workflows/ci.yml   # CI 流水线（构建 + 测试，不含任何密钥）
├── src/
│   ├── math.ts                # 纯函数
│   ├── index.ts               # 包入口
│   └── cli.ts                 # 可执行入口，用于冒烟测试
├── test/
│   ├── math.test.ts           # 单元测试
│   └── cli.test.ts            # 跑构建产物的集成测试
├── tsconfig.json
└── package.json
```

## 本地命令

| 命令 | 作用 |
| --- | --- |
| `npm ci` | 严格按 lockfile 安装依赖（CI 里用的就是这个） |
| `npm run typecheck` | 只做类型检查，不产出文件 |
| `npm run build` | 清空 `dist/` 并编译到 `dist/` |
| `npm test` | 先构建，再跑 `node --test dist/test/` |
| `npm run smoke` | 直接执行构建产物 `dist/src/cli.js 1 2 3` |
| `npm run ci` | 上面四步串起来，等价于 CI 的完整流程 |

测试用的是 Node 内置测试运行器（`node:test`），**没有额外的测试框架依赖**，装完只有 TypeScript 和 `@types/node`。

> ⚠️ 一个踩过的坑：`npm test` 必须写成 `node --test "dist/test/*.test.js"`（**引号不能省**）。
> 不写引号时 shell 会抢先展开，在 Windows 上失效；写成目录 `node --test dist/test/` 时，
> Node 在 Windows 上会把它当成模块路径去 require，直接 `MODULE_NOT_FOUND`。
> 带引号交给 Node 自己展开 glob，Windows / Linux 都能跑。这要求 Node ≥ 22。

## CI 流水线说明

`.github/workflows/ci.yml` 的关键设计：

- **触发**：`main` 分支的 push / PR，外加手动 `workflow_dispatch`。
- **矩阵**：Node 22 / 24 并行跑，`fail-fast: false`，一个版本挂了不影响看清其他版本。
  （Node 20 已于 2026-04 停止维护，不再纳入。）
- **缓存**：`setup-node` 的 `cache: npm` 按 `package-lock.json` 自动缓存。
- **安装**：`npm ci` 而不是 `npm install`——严格复现 lockfile，杜绝「我本地是好的」。
- **四道关卡**：类型检查 → 构建 → 单元测试 → 冒烟测试（直接跑产物，验证 dist 不是空壳）。
- **产物**：只在 Node 20 上传一份 `dist/`，保留 7 天；`if-no-files-found: error` 保证空产物会红。
- **聚合门**：`ci-gate` job 汇总矩阵结果，分支保护里只需要勾这一个 check，
  以后加减矩阵维度不用改分支保护规则。
- **权限**：顶层 `permissions: contents: read`，最小权限。
- **并发**：同一 ref 上重复推送会取消上一个未完成的运行（PR 场景）。

## 怎么加部署

当前流水线**不含任何 Secrets**，`ci-gate` 就是终点。要接部署，加一个 `needs: ci-gate` 的 job：

```yaml
  deploy:
    name: 部署到 GitHub Pages
    needs: ci-gate
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist-node-22
          path: dist/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist/
      - id: deployment
        uses: actions/deploy-pages@v4
```

要点：部署 job 单独提权（`pages: write` / `id-token: write`），
而不是把顶层 `permissions` 放大——这样 PR 里的流水线永远拿不到部署凭证。

## 用在你自己的项目上

1. 把 `src/` 和 `test/` 换成你的代码。
2. 对齐 `package.json` 里的脚本名（`typecheck` / `build` / `test` / `smoke`）——
   脚本名对上了，YAML 基本不用动。
3. 调整 `matrix.node-version` 到你实际支持的版本。
4. 需要部署时再按上一节加 job。
