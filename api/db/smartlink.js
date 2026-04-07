import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const smartlinkPool = mysql.createPool({
  host: process.env.DB_HOST_SMARTLINK,
  port: Number(process.env.DB_PORT_SMARTLINK) || 3306,
  user: process.env.DB_USER_SMARTLINK,
  password: process.env.DB_PASS_SMARTLINK,
  database: process.env.DB_NAME_SMARTLINK,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false },
});

export default smartlinkPool;
