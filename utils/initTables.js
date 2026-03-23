const pool = require("../config/db");

const categories = ["dairy", "bakery", "fruits", "beverages", "snacks", "essentials"];

async function initTables() {
  try {
    // Owner auth table (email verification flow)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS owner (
        user_id VARCHAR(16) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255),
        mobile VARCHAR(20),
        is_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Owner panel login table (AeroDrop branding)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS aerodrop_owner (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(16) UNIQUE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_verified BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      INSERT INTO aerodrop_owner (id, user_id, name, email, phone, password)
      VALUES (1, 'AD-OWN-001', 'aerodrop-owner', 'owner@aerodrop.app', '9999999999', 'aerodrop123')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Client table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS aerodrop_users (
        user_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      INSERT INTO aerodrop_users (name, email, password, phone, address)
      VALUES ('aerodrop-client', 'client@aerodrop.app', 'client123', '8888888888', '123 Aero Colony')
      ON CONFLICT (email) DO NOTHING;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS aerodrop_user_addresses (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(16) NOT NULL,
        full_name VARCHAR(100),
        phone_number VARCHAR(15),
        street_address TEXT NOT NULL,
        landmark TEXT,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100),
        postal_code VARCHAR(20) NOT NULL,
        country VARCHAR(100) DEFAULT 'India',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sample_products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price INTEGER NOT NULL,
        category VARCHAR(50),
        image_url TEXT,
        rating DECIMAL(2,1) DEFAULT 4.5,
        stock INTEGER DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const productCheck = await pool.query("SELECT COUNT(*) FROM sample_products");
    if (parseInt(productCheck.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO sample_products (name, price, category, image_url) VALUES
        ('Fresh Milk (1L)', 60, 'Dairy', 'https://cdn-icons-png.flaticon.com/512/9708/9708499.png'),
        ('Brown Bread', 45, 'Bakery', 'https://cdn-icons-png.flaticon.com/512/2153/2153786.png'),
        ('Farm Eggs (6pcs)', 55, 'Dairy', 'https://cdn-icons-png.flaticon.com/512/837/837560.png'),
        ('Organic Bananas (1kg)', 80, 'Fruits', 'https://cdn-icons-png.flaticon.com/512/2909/2909761.png'),
        ('Coca Cola (750ml)', 40, 'Beverages', 'https://cdn-icons-png.flaticon.com/512/2405/2405479.png');
      `);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_orders (
        order_id SERIAL PRIMARY KEY,
        user_id VARCHAR(16) NOT NULL,
        address_id INTEGER,
        status VARCHAR(50) DEFAULT 'UNASSIGNED',
        owner_status TEXT DEFAULT 'PENDING',
        total_amount INTEGER NOT NULL,
        items JSONB NOT NULL,
        delivery_agent_coords VARCHAR(100),
        store_coords VARCHAR(100),
        customer_coords VARCHAR(100),
        eta_minutes INTEGER DEFAULT 30,
        delivery_agent_id VARCHAR(50),
        delivery_agent_name VARCHAR(100),
        delivery_person_id VARCHAR(50),
        delivery_person_name VARCHAR(100),
        store_name VARCHAR(150),
        store_address TEXT,
        assigned_at TIMESTAMP,
        delivered_at TIMESTAMP,
        actual_time_taken INTEGER,
        declined_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Backward-compatible schema patches for existing DBs.
    await pool.query(`
      ALTER TABLE delivery_orders
      ADD COLUMN IF NOT EXISTS owner_status TEXT DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS delivery_agent_id VARCHAR(50),
      ADD COLUMN IF NOT EXISTS delivery_agent_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS delivery_person_id VARCHAR(50),
      ADD COLUMN IF NOT EXISTS delivery_person_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS store_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS store_address TEXT,
      ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS actual_time_taken INTEGER,
      ADD COLUMN IF NOT EXISTS declined_reason TEXT,
      ADD COLUMN IF NOT EXISTS customer_coords VARCHAR(100),
      ADD COLUMN IF NOT EXISTS store_coords VARCHAR(100);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_agents (
        agent_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        is_online BOOLEAN DEFAULT TRUE,
        vehicle_type VARCHAR(50)
      );
    `);

    await pool.query(`
      ALTER TABLE delivery_agents ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50);
    `);

    const agentCheck = await pool.query("SELECT COUNT(*) FROM delivery_agents");
    if (parseInt(agentCheck.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO delivery_agents (agent_id, name, password, phone) VALUES
        ('DP-1001', 'Ramesh Kumar', '123456', '9876543210'),
        ('DP-1002', 'Suresh Babu', '123456', '9876543211'),
        ('DP-1003', 'Mahesh Reddy', '123456', '9876543212');
      `);
    }

    console.log("AeroDrop tables are ready");
  } catch (err) {
    console.error("Error creating tables:", err.message);
  }
}

module.exports = { initTables, categories };
