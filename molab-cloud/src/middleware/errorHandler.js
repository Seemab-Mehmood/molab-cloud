function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

function errorHandler(err, req, res, next) {
  console.error('[error]', err);
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.publicMessage || 'Internal server error.' });
}

module.exports = { notFoundHandler, errorHandler };
