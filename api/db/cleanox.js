import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const cleanoxPool = mysql.createPool({
  host: process.env.DB_HOST_CLEANOX,
  port: Number(process.env.DB_PORT_CLEANOX) || 3306,
  user: process.env.DB_USER_CLEANOX,
  password: process.env.DB_PASS_CLEANOX,
  database: process.env.DB_NAME_CLEANOX,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false },
});

export default cleanoxPool;
