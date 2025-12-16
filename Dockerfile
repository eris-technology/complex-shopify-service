# Use Node.js official image from Docker Hub
FROM node:23-alpine

RUN apk add --no-cache git
RUN apk add --no-cache curl

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

## To be removed at somepoint ()Scope is limited to repo and read-only access)
ARG GITHUB_TOKEN

RUN git config --global url."https://${GITHUB_TOKEN}:x-oauth-basic@github.com/".insteadOf "https://github.com/"

# Install dependencies
RUN npm install

# Force fresh reinstall of complex-common-utils only
RUN npm uninstall complex-common-utils && npm install complex-common-utils@github:eris-technology/complex-common-utils

# Copy all source files into the container
COPY . .

# Expose the port the app runs on (change PORT if needed)
EXPOSE 3000

# Command to run the application
CMD ["node", "index.js"]
