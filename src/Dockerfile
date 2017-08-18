FROM node:alpine

RUN apk add --no-cache curl
RUN npm install -g serve
RUN mkdir ./servethis
RUN echo "hello world" > ./servethis/file.txt
WORKDIR ./servethis

EXPOSE 5000
HEALTHCHECK --interval=1s --timeout=1s --retries=12 \
    CMD curl --silent --fail 127.0.0.1:5000/file.txt || exit 1
ENTRYPOINT [ "sh", "-c", "serve", "-p", "5000" ]
