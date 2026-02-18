const errorHandler = (err, req, res, next) => {
  // Handle malformed JSON bodies
  const isJsonSyntax = err instanceof SyntaxError && err.type === "entity.parse.failed";
  if (isJsonSyntax) {
    return res.status(400).json({ error: true, message: "Invalid JSON body" });
  }

  // Multer file upload errors
  if (err?.name === "MulterError") {
    const map = {
      LIMIT_FILE_SIZE: "File too large",
      LIMIT_FILE_COUNT: "Too many files",
      LIMIT_UNEXPECTED_FILE: "Unexpected field",
    };
    const message = map[err.code] || err.message || "Upload error";
    return res.status(400).json({ error: true, message });
  }

  const msg = String(err?.message || "");
  // Cloudinary common message when content isn't a valid image
  if (msg.toLowerCase().includes("unknown file format not allowed") || msg.includes("Invalid file type")) {
    return res.status(400).json({ error: true, message: "Only JPG/PNG/WebP images are allowed" });
  }

  console.error(err.stack || err);
  res.status(err.statusCode || 500).json({
    success: false,
    code: err.code,
    message: err.message || "Server Error",
  });
};

export default errorHandler;
