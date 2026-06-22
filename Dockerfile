# 使用官方 Node.js 轻量镜像 (基于 Alpine)
FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 复制项目文件
COPY package.json package-lock.json* ./
COPY src/ ./src/

# 暴露服务端口
EXPOSE 8787

# 设置环境变量默认值
ENV NODE_ENV=production \
    PORT=8787

# 启动命令
CMD ["node", "src/server.js"]
