import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const maskUri = (uri = "") => {
  // Hide password between ":" and "@"
  try {
    const m = uri.match(/^(mongodb[+\w]*:\/\/)([^:]+):([^@]+)@(.+)$/);
    if (!m) return uri;
    return `${m[1]}${m[2]}:****@${m[4]}`;
  } catch {
    return uri;
  }
};

export const connectMongo = async () => {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DBNAME; // optional
  const appName = process.env.MONGO_APPNAME || "BackendGroup7";
  if (!uri) {
    console.log("MONGO_URI not set — skipping Mongo connection");
    return;
  }

  const options = {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
    appName,
  };
  if (dbName) options.dbName = dbName;

  // Connection event logs
  const conn = mongoose.connection;
  conn.on("connected", () => {
    console.log(`Mongo connected ✅ db=${dbName || conn.name || "(default)"}`);
  });
  conn.on("error", (err) => {
    console.error("Mongo connection error ❌", err?.message || err);
  });
  conn.on("disconnected", () => {
    console.warn("Mongo disconnected ⚠️");
  });
  conn.on("reconnected", () => {
    console.log("Mongo reconnected ♻️");
  });

  try {
    console.log("Connecting MongoDB →", maskUri(uri), dbName ? `(dbName=${dbName})` : "");
    await mongoose.connect(uri, options);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err?.message || err);
    throw err;
  }
};

export const closeMongo = async () => {
  try {
    await mongoose.connection.close();
    console.log("Mongo connection closed");
  } catch (err) {
    console.error("Error closing Mongo connection:", err?.message || err);
  }
};
