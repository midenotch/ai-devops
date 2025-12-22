export const errorHandler = (err, req, res, next) => {
  // Always log the full error object including stack trace to the console/server logs.
  // This ensures that even in production, the stack trace is recorded for debugging
  // purposes, even if it's not sent directly to the client.
  console.error("Error:", err);

  const status = err.status || 500;
  const message = err.message || "Internal server error";

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};