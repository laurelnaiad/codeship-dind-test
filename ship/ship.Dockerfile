FROM node:alpine

WORKDIR /test-run

COPY yarn.lock ./
COPY package.json ./

RUN yarn

WORKDIR /test-run/src
COPY src/ ./

WORKDIR /test-run/test
COPY test/ ./

WORKDIR /test-run
CMD [ ]
