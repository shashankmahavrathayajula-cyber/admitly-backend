function errorHandler(err, req, res, _next) {
  const status = err.statusCode ?? err.status ?? 500;
  const message = err.message ?? 'Internal Server Error';
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    console.error('[Error]', err);
  } else if (status >= 500) {
    console.error('[Error]', status, err.message);
  }
  const clientError =
    isProd && status >= 500
      ? 'Something went wrong. Please try again later.'
      : message;
  res.status(status).json({
    error: clientError,
    ...(!isProd && err.stack && { stack: err.stack }),
  });
}

module.exports = errorHandler;
