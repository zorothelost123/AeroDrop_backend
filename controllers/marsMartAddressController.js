const pool = require("../config/db");

const getAuthUserId = (req) => req?.user?.userId || req?.user?.user_id || req?.user?.id || null;

exports.getAeroDropAddresses = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await pool.query(
      `SELECT *
       FROM aerodrop_user_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("getAeroDropAddresses:", err);
    res.status(500).json({ message: "Server error fetching AeroDrop addresses" });
  }
};

exports.addAeroDropAddress = async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const {
    full_name,
    phone_number,
    street_address,
    landmark,
    city,
    state,
    postal_code,
    country,
    is_default,
  } = req.body;

  try {
    if (is_default) {
      await pool.query(
        "UPDATE aerodrop_user_addresses SET is_default = FALSE WHERE user_id = $1",
        [userId]
      );
    }

    const countCheck = await pool.query(
      "SELECT COUNT(*) FROM aerodrop_user_addresses WHERE user_id = $1",
      [userId]
    );
    const isFirstAddress = parseInt(countCheck.rows[0].count, 10) === 0;
    const finalDefault = Boolean(is_default) || isFirstAddress;

    const result = await pool.query(
      `INSERT INTO aerodrop_user_addresses
       (user_id, full_name, phone_number, street_address, landmark, city, state, postal_code, country, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        userId,
        full_name || null,
        phone_number || null,
        street_address,
        landmark || null,
        city,
        state || null,
        postal_code,
        country || "India",
        finalDefault,
      ]
    );

    res.status(201).json({ message: "AeroDrop address added", address: result.rows[0] });
  } catch (err) {
    console.error("addAeroDropAddress:", err);
    res.status(500).json({ message: "Server error adding AeroDrop address" });
  }
};

exports.updateAeroDropAddress = async (req, res) => {
  const { id } = req.params;
  const userId = getAuthUserId(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const {
    full_name,
    phone_number,
    street_address,
    landmark,
    city,
    state,
    postal_code,
    country,
    is_default,
  } = req.body;

  try {
    if (is_default) {
      await pool.query(
        "UPDATE aerodrop_user_addresses SET is_default = FALSE WHERE user_id = $1",
        [userId]
      );
    }

    const result = await pool.query(
      `UPDATE aerodrop_user_addresses
       SET full_name=$1,
           phone_number=$2,
           street_address=$3,
           landmark=$4,
           city=$5,
           state=$6,
           postal_code=$7,
           country=$8,
           is_default=$9
       WHERE id=$10 AND user_id=$11
       RETURNING *`,
      [
        full_name || null,
        phone_number || null,
        street_address,
        landmark || null,
        city,
        state || null,
        postal_code,
        country || "India",
        Boolean(is_default),
        id,
        userId,
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "AeroDrop address not found" });
    }

    res.json({ message: "AeroDrop address updated", address: result.rows[0] });
  } catch (err) {
    console.error("updateAeroDropAddress:", err);
    res.status(500).json({ message: "Server error updating AeroDrop address" });
  }
};

exports.deleteAeroDropAddress = async (req, res) => {
  const { id } = req.params;
  const userId = getAuthUserId(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const deleted = await pool.query(
      "DELETE FROM aerodrop_user_addresses WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, userId]
    );

    if (!deleted.rows.length) {
      return res.status(404).json({ message: "AeroDrop address not found" });
    }

    const remaining = await pool.query(
      `SELECT id, is_default
       FROM aerodrop_user_addresses
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );

    const list = remaining.rows;
    const hasDefault = list.some((item) => item.is_default);

    if (list.length > 0 && !hasDefault) {
      await pool.query(
        "UPDATE aerodrop_user_addresses SET is_default = TRUE WHERE id = $1 AND user_id = $2",
        [list[0].id, userId]
      );
    }

    res.json({ message: "AeroDrop address deleted successfully" });
  } catch (err) {
    console.error("deleteAeroDropAddress:", err);
    res.status(500).json({ message: "Server error deleting AeroDrop address" });
  }
};
