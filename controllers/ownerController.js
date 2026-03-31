const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const isProduction = process.env.NODE_ENV === "production";
const authCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
};

exports.getOwnerAdminInfo = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, name, email, phone, is_verified, created_at
       FROM aerodrop_owner
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      count: result.rows.length,
      owners: result.rows,
    });
  } catch (err) {
    console.error("Error fetching owner info:", err);
    res.status(500).json({ success: false, message: "Failed to fetch owner info" });
  }
};

exports.signup = async (req, res) => {
  try {
    const { name, email, password, userId } = req.body;

    if (!email || !name || !password || !userId) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const exists = await pool.query("SELECT user_id FROM owner WHERE email = $1", [email]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const created = await pool.query(
      `INSERT INTO owner
        (user_id, name, email, password, verification_token, is_verified)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING user_id, name, email, verification_token`,
      [userId, name, email, hashed, verificationToken]
    );

    res.json({
      message: "Signup successful. Please verify your email.",
      verificationToken: created.rows[0].verification_token,
      user: created.rows[0],
    });
  } catch (err) {
    console.error("Owner signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const token = req.params.token || req.body.token;
    if (!token) {
      return res.status(400).json({ message: "Token missing" });
    }

    const result = await pool.query(
      "SELECT user_id, is_verified FROM owner WHERE verification_token = $1",
      [token]
    );

    if (!result.rows.length) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const owner = result.rows[0];
    if (owner.is_verified) {
      return res.json({ message: "Already verified" });
    }

    await pool.query(
      `UPDATE owner
       SET is_verified = true,
           verification_token = NULL
       WHERE user_id = $1`,
      [owner.user_id]
    );

    res.json({ message: "Email verified successfully" });
  } catch (err) {
    console.error("verifyEmail error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query("SELECT * FROM owner WHERE email = $1", [email]);
    const owner = result.rows[0];

    if (!owner) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!owner.is_verified) {
      return res.status(403).json({ message: "Please verify your email before logging in" });
    }

    const isMatch = await bcrypt.compare(password, owner.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: owner.user_id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.cookie("authToken", token, authCookieOptions);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        user_id: owner.user_id,
        name: owner.name,
        email: owner.email,
      },
    });
  } catch (err) {
    console.error("Owner login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.changePassword = async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;

  if (!email || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: "New passwords do not match" });
  }

  const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*])(?=.*\d).{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({
      message:
        "New password must be at least 8 characters long, include one uppercase letter, one number, and one special character",
    });
  }

  try {
    const result = await pool.query("SELECT * FROM owner WHERE email = $1 LIMIT 1", [email]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "User with this email does not exist" });
    }

    const user = result.rows[0];
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      return res.status(400).json({ message: "New password must be different from the old password" });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await pool.query("UPDATE owner SET password = $1 WHERE email = $2", [
      hashedNewPassword,
      email,
    ]);

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Password change error:", err);
    res.status(500).json({ message: "Internal server error while changing password" });
  }
};

exports.getMe = async (req, res) => {
  try {
    const token = req.cookies.authToken;

    if (!token) {
      return res.status(401).json({ user: null });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      "SELECT user_id, name, email FROM owner WHERE user_id = $1",
      [decoded.userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ user: null });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("auth/me error:", err.message);
    res.status(401).json({ user: null });
  }
};

exports.aeroDropOwnerLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT id, name, email, phone, password FROM aerodrop_owner WHERE email = $1",
      [email]
    );

    const owner = result.rows[0];

    if (!owner) {
      return res.status(401).json({ success: false, message: "Owner not found with this email" });
    }

    if (owner.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    const { password: _, ...ownerData } = owner;
    const token = jwt.sign({ userId: owner.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.cookie("authToken", token, authCookieOptions);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      owner: ownerData,
    });
  } catch (error) {
    console.error("AeroDrop Owner Login Error:", error);
    res.status(500).json({ success: false, message: "Internal server error during login" });
  }
};

exports.aeroDropClientLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT user_id, name, email, phone, address, password FROM aerodrop_users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    if (user.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    delete user.password;

    const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.cookie("authToken", token, authCookieOptions);

    res.status(200).json({
      success: true,
      message: "Welcome to AeroDrop!",
      token,
      user,
    });
  } catch (error) {
    console.error("Client Login Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
