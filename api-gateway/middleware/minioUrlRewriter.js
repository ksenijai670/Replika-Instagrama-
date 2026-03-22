module.exports = function minioUrlRewriter(req, res, next) {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  function rewrite(body) {
    if (typeof body === 'string') {
      return body.replace(/http:\/\/minio:9000/g, 'http://localhost:9000');
    }
    if (typeof body === 'object' && body !== null) {
      return JSON.parse(
        JSON.stringify(body).replace(/http:\/\/minio:9000/g, 'http://localhost:9000')
      );
    }
    return body;
  }

  res.json = (body) => originalJson(rewrite(body));
  res.send = (body) => originalSend(rewrite(body));

  next();
};