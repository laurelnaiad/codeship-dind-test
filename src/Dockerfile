FROM node:alpine

RUN apk add --no-cache curl
RUN npm install -g serve
RUN mkdir ./servethis
RUN echo "hello world" > ./servethis/file.txt
WORKDIR ./servethis

EXPOSE 5000

ENTRYPOINT [ "sh", "-c", "serve", "-p", "5000" ]
