# Stage 1: Build the React Application
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_WEB_PUSH_PUBLIC_KEY=""
ENV VITE_WEB_PUSH_PUBLIC_KEY=$VITE_WEB_PUSH_PUBLIC_KEY
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
# Copy the build output to replace the default nginx contents.
COPY --from=build /app/dist /usr/share/nginx/html
# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
