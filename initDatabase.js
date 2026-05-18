import mysql from "mysql2/promise";
import fs from "fs";

const connection = await mysql.createConnection({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  multipleStatements: true,
});

const sql = fs.readFileSync("./database/init.sql", "utf8");

await connection.query(sql);

console.log("✅ Base de datos inicializada correctamente");

await connection.end();