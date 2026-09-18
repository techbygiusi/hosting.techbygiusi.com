FROM alpine:3.22

RUN apk add --no-cache python3 docker-cli docker-cli-compose

WORKDIR /app

EXPOSE 3010

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=6 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3010/health', timeout=3).read()" || exit 1

CMD ["sh", "-c", "exec python3 \"$PROJECT_DIR/updater/app.py\""]
