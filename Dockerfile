s# Use the official Node.js image as the base image (layer 1)
FROM node:20 

# Set the working directory inside the container (layer 2)
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Expose the port your app runs on
EXPOSE 3030

# Set the default command to run your app
CMD ["npm", "start"]