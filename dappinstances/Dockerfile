FROM node:6.9
COPY ./marbles /marbles
WORKDIR /marbles
RUN rm -rf node_modules && npm install && npm install -g gulp
