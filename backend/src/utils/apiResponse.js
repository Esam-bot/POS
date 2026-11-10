function success(res, message, data = null, statusCode = 200) {
  const body = { success: true, message };
  if (data !== null && data !== undefined) {
    body.data = data;
  }
  return res.status(statusCode).json(body);
}

function fail(res, message, errors = [], statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    message,
    errors: Array.isArray(errors) ? errors : [errors],
  });
}

module.exports = { success, fail };
