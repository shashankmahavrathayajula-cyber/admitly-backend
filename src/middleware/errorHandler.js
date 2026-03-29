function errorHandler(err, req, res, _next) {
  const status = err.statusCode ?? err.status ?? 500;
  const message = err.message ?? 'Internal Server Error';
  if (process.env.NODE_ENV === 'development') {
    console.error('[Error]', err);
  }
  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && err.stack && { stack: err.stack }),
  });
}

module.exports = errorHandler;
