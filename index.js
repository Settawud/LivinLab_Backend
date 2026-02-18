import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import apiRoutes from "./api/v1/routes.js";
import errorHandler from "./middleware/errorHandler.js";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();

app.set("trust proxy", 1);

// Global middlewares


// Build CORS origin list from env, fallback to common dev/prod URLs
const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "https://group7-project-sprint2-git-develop-settawuds-projects.vercel.app",
  "https://group7-project-sprint2.vercel.app",
];
const envOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...envOrigins, ...defaultOrigins])];

const corsOptions = {
  origin: function (origin, callback) {
    // allow no-origin requests (curl, mobile apps)
    if (!origin) return callback(null, true);
    const ok = allowedOrigins.includes(origin);
    callback(ok ? null : new Error(`CORS: ${origin} not allowed`), ok);
  },
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
// Centralized routes
// Mount routes; some route groups accept an optional db client
app.use("/", apiRoutes(null));
app.get("/", (_req, res) => {
  res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Notes API</title>
        <style>
          body {
            font-family: 'Segoe UI', sans-serif;
            background: #f7f9fc;
            color: #333;
            text-align: center;
            padding: 50px;
          }
          h1 {
            font-size: 2.5rem;
            color: #2c3e50;
          }
          p {
            font-size: 1.2rem;
            margin-top: 1rem;
          }
          code {
            background: #eee;
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-size: 0.95rem;
          }
          .container {
            max-width: 600px;
            margin: auto;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📒 Welcome to the Notes API</h1>
          <p>This is a simple REST API built with <strong>Express</strong> and <strong>LibSQL</strong>.</p>
          <p>Try creating a note via <code>POST /notes</code> or explore routes like <code>/users</code> and <code>/notes-with-authors</code>.</p>
          <p>Use a REST client like <em>VSCode REST Client</em> or <em>Postman</em> to interact.</p>
          <p>✨ Happy coding!</p>
        </div>
      </body>
      </html>
    `);
});


// Centralized error handling
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    // Optional: connect to Mongo if configured
    if (process.env.MONGO_URI) {
      const { connectMongo } = await import("./config/mongo.js");
      await connectMongo();

    } else {
      console.log("MONGO_URI not set — skipping Mongo connection");
    }

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT} ✅`);
      console.log(`http://localhost:4000`)
    });
  } catch (err) {
    console.error("❌ Startup error:", err);
    process.exit(1);
  }
})();

// Handle unhandled promise rejections globally
process.on("unhandledRejection", (err) => {
  console.error("💥 Unhandled Rejection:", err?.message || err);
  // Avoid crashing the dev server on expected request errors (e.g., bad uploads)
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
});