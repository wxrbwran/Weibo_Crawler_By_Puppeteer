const mysql = require('mysql');
const { db } = require('./config');

const ip = 'http://127.0.0.1:3000';
const host = 'localhost';

const pool = mysql.createPool({
  host:'127.0.0.1',
  user: db.username,
  password: db.password,
  database: db.database,
  connectTimeout:30000
});

const knex = require('knex')({
  client:'mysql',
  connection:{
    host:'localhost',
    user: db.username,
    password: db.password,
    database: db.database,
  }
});

module.exports = { ip, pool, host, knex };
