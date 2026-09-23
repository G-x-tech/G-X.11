# cicd-starter

一个刻意保持最小、但**真的能跑通**的 Node + TypeScript 项目，用来演示 GitHub Actions 的自动构建、测试与部署。

之所以做成模板而不是只丢一个 YAML：CI 流水线的每一步都得对应项目里真实存在的脚本，
否则流水线写出来就是装饰品。

## 目录结构

```
.
├── .github/workflows/ci.yml   # CI/CD 流水线（构建 + 测试 + 部署，零 Secrets）
├── Dockerfile                 # 多阶段构建，运行阶段不带 devDependencies
├── .dockerignore
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
| `npm test` | 先构建，再跑 `node --test "dist/test/*.test.js"` |
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
- **产物**：只在 Node 22 上传一份 `dist/`，保留 7 天；`if-no-files-found: error` 保证空产物会红。
- **聚合门**：`ci-gate` job 汇总矩阵结果，分支保护里只需要勾这一个 check，
  以后加减矩阵维度不用改分支保护规则。
- **权限**：顶层 `permissions: contents: read`，最小权限；部署 job 单独提权。
- **并发**：同一 ref 上重复推送会取消上一个未完成的运行（PR 场景）。
- **部署**：`deploy` job 在 main 推送或手动触发时构建镜像推到 GHCR，
  用内置 `GITHUB_TOKEN` 登录，**不需要配任何 Secrets**；PR 上自动跳过。
- **action 版本**：全部指向当前大版本（`checkout@v7`、`setup-node@v7`、
  `upload-artifact@v7`、`login-action@v4`、`setup-buildx-action@v4`、
  `metadata-action@v6`、`build-push-action@v7`），这些版本均以 `node24` 为运行时，
  不会再出现 "Node.js 20 is deprecated" 的注解告警。

## 部署

流水线已内置部署阶段，产物是 Docker 镜像，推到 GitHub 自家的 GHCR：

```
ghcr.io/g-x-tech/g-x.11:latest          # 默认分支最新
ghcr.io/g-x-tech/g-x.11:main            # 分支名
ghcr.io/g-x-tech/g-x.11:<短 sha>        # 某次提交
```

注意镜像名是**全小写**的：仓库名 `G-X.11` 带大写，而 GHCR 不接受大写镜像名，
流水线里用 `tr '[:upper:]' '[:lower:]'` 做了转换。

拉下来跑：

```bash
docker run --rm ghcr.io/g-x-tech/g-x.11:latest 1 2 3
# 个数 : 3    合计 : ¥6.00    均值 : ¥2.00
```

镜像在仓库右侧的 **Packages** 里能看到，也可以在 `https://github.com/G-x-tech?tab=packages` 查看。

部署阶段内部有四步，顺序是刻意的：

1. **登录 GHCR** —— 用内置 `GITHUB_TOKEN`，仓库默认工作流权限（Read and write）就够，
   通常**不需要改任何设置**。只有当你的组织/仓库把默认权限强制成只读时，
   才需要去 **Settings → Actions → General → Workflow permissions** 选 Read and write。
2. **配置 Buildx** —— 见下方「必踩的坑」，缺了它后面必然失败。
3. **构建（不推送）→ 容器内冒烟** —— 先 `load` 到本地并真的跑一次
   `docker run … 1 2 3`，确认 ENTRYPOINT 与产物路径正确，再推送。
   失败时能一眼分清是「镜像本身有问题」还是「推送权限有问题」。
4. **推送标签** —— 由 `docker/metadata-action` 生成 `main` / `latest` / `<短 sha>` 三个标签。

### 必踩的坑：`cache-to: type=gha` 需要显式配置 Buildx

这是本项目实际踩到并修掉的一个坑，症状非常有迷惑性：

```
buildx failed with: Learn more at https://docs.docker.com/go/build-cache-backends/
```

整步只跑了 11 秒就失败，而且**登录 GHCR 是成功的**，所以看起来很像权限问题，
实际跟权限毫无关系——默认的 `docker` 驱动不支持把构建缓存导出到外部后端。
只要用了 `cache-to: type=gha` 却没有先跑 `docker/setup-buildx-action`，就会这样。

修法就是在构建之前加一步：

```yaml
      - name: 配置 Buildx
        uses: docker/setup-buildx-action@v4
```

配置后会切到 `docker-container` 驱动，`cache-from` / `cache-to` / `load` 才都可用。

### 怎么读这类失败原因

Actions 页面的日志匿名 API 取不到（需要管理员权限），但**注解（annotations）是公开的**。
用 job 对象里的 `check_run_url` 加 `/annotations` 就能拿到原始报错：

```
GET https://api.github.com/repos/<owner>/<repo>/actions/runs/<run_id>/jobs
  → 取失败 job 的 check_run_url
GET <check_run_url>/annotations
```

上面那句 `buildx failed with …` 就是这么挖出来的，比翻日志快得多。

### `Dockerfile` 的取舍

- **多阶段**：构建阶段装全部依赖并编译，运行阶段只拷 `dist/src`，
  `devDependencies` 和源码都不进最终镜像。
- **`npm ci --omit=dev`**：本项目运行时零第三方依赖，运行阶段装完几乎是空的。
- **`USER node`**：不用 root 跑容器。
- **`.dockerignore`**：排除 `node_modules/` `dist/` `.git/`，否则本地产物会污染构建上下文。

### 换成别的部署目标

要换成其他目标时，把 `deploy` job 的 steps 替换掉即可，其余不用动。
比如部署静态产物到 GitHub Pages（版本号以各自仓库当前大版本为准）：

```yaml
  deploy:
    name: 部署到 GitHub Pages
    needs: build-test
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/download-artifact@v8
        with:
          name: dist-node-22
          path: dist/
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist/
      - id: deployment
        uses: actions/deploy-pages@v5
```

要点：部署 job 单独提权（`pages: write` / `id-token: write`），
而不是把顶层 `permissions` 放大——这样 PR 里的流水线永远拿不到部署凭证。
注意 Pages 还需要在 **Settings → Pages → Source** 里选 **GitHub Actions**。

## 分支保护

目标：`main` 只允许通过 PR 合入，且必须等 CI 绿了才能合，同时禁止强推与删除分支。

规则定义在 `.github/branch-protection.json`，只要求一个 check——聚合门 **CI 通过**。
这样以后加减 Node 矩阵维度，都不用回头改保护规则。

> ⚠️ **这一步没法完全自动**：管理分支保护需要仓库管理（administration）权限，
> 而它**不在 `GITHUB_TOKEN` 的权限表里**（属于细粒度 PAT 的权限）。
> 实测把 `administration: write` 写进 workflow 会被 GitHub 直接判为非法文件：
>
> ```
> Invalid workflow file: (Line: 17, Col: 3): Unexpected value 'administration'
> ```
>
> 所以剩下的部分只能在网页点一下，或者配一个 PAT 让它一键下发。

### 方式一：网页点（约 30 秒）

1. 打开 `Settings → Branches → Add branch protection rule`
2. **Branch name pattern** 填 `main`
3. 勾 **Require status checks to pass before merging**
   - 在搜索框输入 `CI 通过` 并选中（该 check 必须至少跑过一次才会出现在列表里）
   - 建议同时勾 **Require branches to be up to date before merging**
4. 勾 **Do not allow force pushes** 和 **Do not allow deletions**
5. **Create**

### 方式二：配 PAT 后一键下发（一次配置，长期有效）

1. 建细粒度 PAT：`Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token`
   - Repository access：**Only select repositories** → 选中本仓库
   - Repository permissions：**Administration → Read and write**
2. 存成仓库 Secret：`Settings → Secrets and variables → Actions →
   New repository secret`，名字必须是 `BRANCH_PROTECTION_TOKEN`
3. 在 **Actions → 配置分支保护 → Run workflow** 手动跑一次

之后只要改 `.github/branch-protection.json` 并推到 `main`，规则就会自动同步。
没配这个 Secret 时，该工作流只会打印一条 notice 然后正常退出，不会把流水线弄红。

## 用在你自己的项目上

1. 把 `src/` 和 `test/` 换成你的代码。
2. 对齐 `package.json` 里的脚本名（`typecheck` / `build` / `test` / `smoke`）——
   脚本名对上了，YAML 基本不用动。
3. 调整 `matrix.node-version` 到你实际支持的版本。
4. 部署默认走 GHCR 镜像；要换目标就替换 `deploy` job 的 steps。
