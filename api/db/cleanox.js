import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const cleanoxPool = mysql.createPool({
  host: process.env.DB_HOST_CLEANOX,
  port: Number(process.env.DB_PORT_CLEANOX) || 3306,
  user: process.env.DB_USER_CLEANOX,
  password: process.env.DB_PASS_CLEANOX,
  database: process.env.DB_NAME_CLEANOX,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+07:00',
  ssl: { rejectUnauthorized: false },
});

cleanoxPool.on('connection', (connection) => {
  connection.query("SET time_zone = '+07:00'");
});

export const aloraPool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+07:00',
  ssl: { rejectUnauthorized: false },
});

export const smartlinkPool = mysql.createPool({
  host: process.env.DB_HOST_SMARTLINK,
  port: Number(process.env.DB_PORT_SMARTLINK) || 3306,
  user: process.env.DB_USER_SMARTLINK,
  password: process.env.DB_PASS_SMARTLINK,
  database: process.env.DB_NAME_SMARTLINK,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+07:00',
  ssl: { rejectUnauthorized: false },
});

export const cleanoxSmartlinkPool = mysql.createPool({
  host: process.env.DB_HOST_CLEANOX_SMARTLINK,
  port: Number(process.env.DB_PORT_CLEANOX_SMARTLINK) || 3306,
  user: process.env.DB_USER_CLEANOX_SMARTLINK,
  password: process.env.DB_PASS_CLEANOX_SMARTLINK,
  database: process.env.DB_NAME_CLEANOX_SMARTLINK,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+07:00',
  ssl: { rejectUnauthorized: false },
});

export default cleanoxPool;


