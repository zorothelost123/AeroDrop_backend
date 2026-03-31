const pool = require("../config/db");
const jwt = require("jsonwebtoken");

exports.getProducts = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sample_products ORDER BY id ASC");
    res.json({ success: true, products: result.rows });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Error fetching products" });
  }
};

exports.placeOrder = async (req, res) => {
  const { userId } = req.user;
  const { address_id, items, total_amount, user_gps, customer_coords } = req.body;

  if (!address_id || !items || !total_amount) {
    return res.status(400).json({ message: "Missing order details" });
  }

  try {
    let customerLat;
    let customerLng;

    if (customer_coords && customer_coords.lat && customer_coords.lng) {
      customerLat = parseFloat(customer_coords.lat);
      customerLng = parseFloat(customer_coords.lng);
    } else if (user_gps && user_gps.lat && user_gps.lng) {
      customerLat = parseFloat(user_gps.lat);
      customerLng = parseFloat(user_gps.lng);
    } else {
      return res.status(400).json({ message: "Valid location coordinates are required to place an order." });
    }

    const customerCoordsStr = `${customerLat},${customerLng}`;

    // Keep exact 700m dynamic radius logic.
    const radiusInDegrees = 0.0063;
    const latOffset = (Math.random() - 0.5) * 2 * radiusInDegrees;
    const lngOffset = (Math.random() - 0.5) * 2 * radiusInDegrees;

    const storeLat = customerLat + latOffset;
    const storeLng = customerLng + lngOffset;
    const startLocation = `${storeLat.toFixed(6)},${storeLng.toFixed(6)}`;

    const dummyStores = [
      { name: "AeroDrop Hub - Local Branch", address: "Main Road" },
      { name: "AeroDrop Express - Quick Store", address: "Express Area" },
    ];

    const randomStore = dummyStores[Math.floor(Math.random() * dummyStores.length)];

    const result = await pool.query(
      `INSERT INTO delivery_orders
      (user_id, address_id, status, owner_status, total_amount, items,
       delivery_agent_coords, eta_minutes, delivery_person_id,
       delivery_person_name, store_name, store_address, customer_coords, store_coords)
      VALUES ($1,$2,'PENDING','PENDING',$3,$4,$5,15,NULL,NULL,$6,$7,$8,$9)
      RETURNING *`,
      [
        userId,
        address_id,
        total_amount,
        JSON.stringify(items),
        startLocation,
        randomStore.name,
        randomStore.address,
        customerCoordsStr,
        startLocation,
      ]
    );

    const order = result.rows[0];
    const io = req.app.get("io");

    if (io) {
      io.emit("new_order", { orderId: order.order_id });
      io.emit("new_order", { order });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).json({ message: "Error placing order" });
  }
};

exports.getOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  try {
    const result = await pool.query("SELECT * FROM delivery_orders WHERE order_id = $1", [orderId]);

    if (!result.rows.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error("Error fetching status:", err);
    res.status(500).json({ message: "Error fetching status" });
  }
};

exports.ownerAcceptOrder = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE delivery_orders
       SET owner_status='ACCEPTED', status='UNASSIGNED', assigned_at=NOW()
       WHERE order_id=$1 RETURNING *`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = result.rows[0];
    const io = req.app.get("io");
    if (io) {
      io.to(`order_${id}`).emit("order_status_updated", { orderId: id, status: "UNASSIGNED" });
      io.emit("new_unassigned_order", order);
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error("Owner accept error:", err);
    res.status(500).json({ message: "Accept failed" });
  }
};

exports.ownerDeclineOrder = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE delivery_orders
       SET owner_status='DECLINED', status='DECLINED'
       WHERE order_id=$1 RETURNING *`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`order_${id}`).emit("order_status_updated", { orderId: id, status: "DECLINED" });
    }

    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error("Owner decline error:", err);
    res.status(500).json({ message: "Decline failed" });
  }
};

exports.agentLogin = async (req, res) => {
  const { agent_id, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM delivery_agents WHERE agent_id = $1 AND password = $2",
      [agent_id, password]
    );

    if (!result.rows.length) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const agent = result.rows[0];

    const token = jwt.sign(
      { agent_id: agent.agent_id, id: agent.agent_id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      agent: {
        id: agent.agent_id,
        name: agent.name,
        phone: agent.phone,
      },
    });
  } catch (err) {
    console.error("Agent login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
};

exports.getUnassignedOrders = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM delivery_orders WHERE status = 'UNASSIGNED' ORDER BY created_at DESC"
    );
    res.json({ success: true, orders: result.rows });
  } catch (err) {
    console.error("Error fetching unassigned orders:", err);
    res.status(500).json({ message: "Error fetching unassigned orders" });
  }
};

exports.getUserOrders = async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM delivery_orders WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    res.json({ success: true, orders: result.rows });
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res.status(500).json({ success: false, message: "Error fetching orders" });
  }
};

exports.acceptOrder = async (req, res) => {
  const { orderId } = req.params;
  const { agent_id, agent_name } = req.body;

  if (!agent_id || !agent_name) {
    return res.status(400).json({ message: "Agent details required" });
  }

  try {
    // Keep exact double-assignment lock behavior.
    const check = await pool.query("SELECT status FROM delivery_orders WHERE order_id = $1", [orderId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (check.rows[0].status !== "UNASSIGNED" && check.rows[0].status !== "PREPARING") {
      return res.status(400).json({ message: "Order already assigned or in progress" });
    }

    const result = await pool.query(
      `UPDATE delivery_orders
       SET status='PREPARING',
           delivery_person_id=$1,
           delivery_person_name=$2,
           delivery_agent_id=$1,
           delivery_agent_name=$2,
           assigned_at=COALESCE(assigned_at, NOW())
       WHERE order_id=$3 AND (status = 'UNASSIGNED' OR status = 'PREPARING')
       RETURNING *`,
      [agent_id, agent_name, orderId]
    );

    if (!result.rows.length) {
      return res.status(400).json({ success: false, message: "Order unavailable" });
    }

    const order = result.rows[0];

    const io = req.app.get("io");
    if (io) {
      const room = `order_${orderId}`;
      io.to(room).emit("order_status_updated", {
        orderId,
        status: "PREPARING",
        delivery_person_name: agent_name,
        delivery_agent_id: agent_id,
      });
      io.emit("order_accepted", { orderId });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error("Error accepting order:", err);
    res.status(500).json({ message: "Error accepting order" });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  try {
    let result;

    if (status === "DELIVERED") {
      const { otp } = req.body;
      const expectedOtp = String(orderId * 73 + 1000).substring(0, 4);

      if (!otp || String(otp) !== expectedOtp) {
        return res.status(400).json({ success: false, message: "Invalid OTP. Delivery verification failed." });
      }

      result = await pool.query(
        `UPDATE delivery_orders
         SET status='DELIVERED',
             delivered_at=NOW(),
             actual_time_taken = ROUND(EXTRACT(EPOCH FROM (NOW() - assigned_at))/60)
         WHERE order_id=$1
         RETURNING *`,
        [orderId]
      );
    } else {
      result = await pool.query(
        "UPDATE delivery_orders SET status = $1 WHERE order_id = $2 RETURNING *",
        [status, orderId]
      );
    }

    if (!result.rows.length) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = result.rows[0];
    const io = req.app.get("io");

    if (io) {
      const room = `order_${orderId}`;
      io.to(room).emit("order_status_updated", {
        orderId,
        status: order.status,
        eta: status === "DELIVERED" ? 0 : order.eta_minutes,
      });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ message: "Status update failed" });
  }
};

exports.getActiveOrders = async (req, res) => {
  try {
    const agentId = req.agent?.agent_id || req.agent?.id;
    let result;

    if (agentId) {
      result = await pool.query(
        "SELECT * FROM delivery_orders WHERE (delivery_person_id = $1 OR delivery_agent_id = $1) AND status NOT IN ('DELIVERED', 'DECLINED', 'UNASSIGNED', 'PENDING') ORDER BY created_at DESC",
        [agentId]
      );
    } else {
      result = await pool.query(
        "SELECT * FROM delivery_orders WHERE status IN ('PREPARING', 'AGENT_REACHING_STORE', 'PICKED_UP', 'ON_THE_WAY', 'REACHED') ORDER BY created_at DESC"
      );
    }

    res.json({ success: true, orders: result.rows });
  } catch (err) {
    console.error("Error fetching active orders:", err);
    res.status(500).json({ message: "Error fetching active orders" });
  }
};

exports.getOwnerDeliveries = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        order_id, user_id, address_id, status, total_amount, items,
        eta_minutes, delivery_person_id, delivery_person_name,
        store_name, store_address,
        created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS created_at,
        delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata' AS delivered_at,
        actual_time_taken
      FROM delivery_orders
      WHERE status != 'CANCELLED'
      ORDER BY created_at DESC
    `);

    const orders = result.rows;
    const productsRes = await pool.query("SELECT name, image_url FROM sample_products");
    const productMap = {};
    productsRes.rows.forEach((p) => {
      productMap[p.name.toLowerCase()] = p.image_url;
    });

    const enrichedOrders = orders.map((order) => {
      let parsedItems = [];
      try {
        parsedItems = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
      } catch (err) {
        parsedItems = [];
      }

      const updatedItems = parsedItems.map((item) => ({
        ...item,
        image_url: productMap[item.name?.toLowerCase()] || null,
      }));

      return { ...order, items: updatedItems };
    });

    res.json({ success: true, orders: enrichedOrders });
  } catch (err) {
    console.error("Owner deliveries error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.createProducts = async (req, res) => {
  const { name, price, category } = req.body;
  let { image_url } = req.body;
  
  if (!image_url || image_url.trim() === "") {
    image_url = "https://placehold.co/400x300?text=AeroDrop+Item";
  }

  try {
    const result = await pool.query(
      "INSERT INTO sample_products (name, price, category, image_url) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, price, category, image_url]
    );
    res.status(201).json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(500).json({ message: "Error creating product" });
  }
};

exports.editProducts = async (req, res) => {
  const { id, name, price, category, image_url } = req.body;
  try {
    const result = await pool.query(
      "UPDATE sample_products SET name=$1, price=$2, category=$3, image_url=$4 WHERE id=$5 RETURNING *",
      [name, price, category, image_url, id]
    );
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({ message: "Error updating product" });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    await pool.query("DELETE FROM sample_products WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ message: "Error deleting product" });
  }
};

exports.getAgents = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM delivery_agents ORDER BY agent_id ASC");
    res.json({ success: true, agents: result.rows });
  } catch (err) {
    console.error("Error fetching agents:", err);
    res.status(500).json({ message: "Error fetching agents" });
  }
};

exports.createAgent = async (req, res) => {
  const { name, phone, password, vehicle_type } = req.body;

  try {
    const lastAgentResult = await pool.query(
      "SELECT agent_id FROM delivery_agents WHERE agent_id LIKE 'DP-%' ORDER BY agent_id DESC LIMIT 1"
    );

    let nextId = "DP-1001";
    if (lastAgentResult.rows.length > 0) {
      const lastId = lastAgentResult.rows[0].agent_id;
      const lastNum = parseInt(lastId.split("-")[1], 10);
      nextId = `DP-${lastNum + 1}`;
    }

    const result = await pool.query(
      "INSERT INTO delivery_agents (agent_id, name, phone, password, vehicle_type) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [nextId, name, phone, password || "1234", vehicle_type || null]
    );

    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error("Error creating agent:", err);
    res.status(500).json({ message: "Error creating agent" });
  }
};

exports.updateAgent = async (req, res) => {
  const { id } = req.params;
  const { name, phone, password } = req.body;

  try {
    const result = await pool.query(
      "UPDATE delivery_agents SET name=$1, phone=$2, password=$3 WHERE agent_id=$4 RETURNING *",
      [name, phone, password || "1234", id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error("Error updating agent:", err);
    res.status(500).json({ message: "Error updating agent" });
  }
};

exports.deleteAgent = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("DELETE FROM delivery_agents WHERE agent_id = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    res.json({ success: true, message: "Agent deleted successfully" });
  } catch (err) {
    console.error("Error deleting agent:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.cancelOrder = async (req, res) => {
  const { orderId } = req.params;

  try {
    const check = await pool.query("SELECT * FROM delivery_orders WHERE order_id = $1", [orderId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = check.rows[0];

    if (order.status !== "PENDING" && order.status !== "UNASSIGNED") {
      return res.status(400).json({ message: "Too late! Order is already being processed." });
    }

    const result = await pool.query(
      `UPDATE delivery_orders
       SET status = 'CANCELLED', owner_status = 'CANCELLED'
       WHERE order_id = $1
       RETURNING *`,
      [orderId]
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`order_${orderId}`).emit("order_status_updated", { orderId, status: "CANCELLED" });
    }

    res.json({ success: true, message: "Order cancelled", order: result.rows[0] });
  } catch (err) {
    console.error("Cancel Order Error:", err);
    res.status(500).json({ message: "Error cancelling order" });
  }
};

exports.generateHandoffToken = async (req, res) => {
  try {
    const agent_id = req.agent?.agent_id || req.agent?.id;

    const handoffToken = jwt.sign({ agent_id }, process.env.JWT_SECRET, {
      expiresIn: "5m",
    });

    res.json({ success: true, handoffToken });
  } catch (err) {
    console.error("Error generating handoff token:", err);
    res.status(500).json({ success: false, message: "Error generating handoff token" });
  }
};

exports.verifyHandoffToken = async (req, res) => {
  const { token } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      "SELECT * FROM delivery_agents WHERE agent_id = $1",
      [decoded.agent_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    const agent = result.rows[0];

    const newToken = jwt.sign(
      { agent_id: agent.agent_id, id: agent.agent_id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token: newToken,
      agent: {
        id: agent.agent_id,
        name: agent.name,
        phone: agent.phone,
      },
    });
  } catch (err) {
    return res.status(401).json({ success: false, message: "Link expired or invalid" });
  }
};

exports.updateAgentStatus = async (req, res) => {
  const agentId = req.agent?.agent_id || req.agent?.id;
  const { is_online } = req.body;

  if (is_online === undefined) {
    return res.status(400).json({ message: "Status is required" });
  }

  try {
    const result = await pool.query(
      "UPDATE delivery_agents SET is_online = $1 WHERE agent_id = $2 RETURNING *",
      [is_online, agentId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "Agent not found" });
    }

    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error("Error updating agent status:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
