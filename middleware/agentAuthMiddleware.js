const jwt = require("jsonwebtoken");

exports.agentProtect = (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.agent = decoded;
      req.user = decoded;

      next();
      return;
    } catch (err) {
      console.error("Agent Auth Error:", err.message);
      return res.status(401).json({ message: "Not authorized, invalid token" });
    }
  }

  return res.status(401).json({ message: "Not authorized, no token" });
};
