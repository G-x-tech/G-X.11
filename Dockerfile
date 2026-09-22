# 多阶段构建：构建阶段负责编译，运行阶段只带产物，镜像更小、攻击面更小

# ---- 阶段一：安装全部依赖并编译 TypeScript ----
FROM node:22-alpine AS build

WORKDIR /app

# 先只拷贝清单文件，让依赖层可以被 Docker 缓存命中
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY test/ ./test/

RUN npm run build

# ---- 阶段二：只保留运行所需内容 ----
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# --omit=dev 跳过 devDependencies，本项目运行时零第三方依赖
RUN npm ci --omit=dev && npm cache clean --force

# 只取编译产物，源码与 devDependencies 不进最终镜像
COPY --from=build /app/dist/src ./dist/src

# 不用 root 跑，降低容器逃逸风险
USER node

ENTRYPOINT ["node", "dist/src/cli.js"]
