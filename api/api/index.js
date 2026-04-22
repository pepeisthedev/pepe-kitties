const { handleRootRequest } = require("../lib/router");

module.exports = async function handler(req, res) {
  return handleRootRequest(req, res);
};
