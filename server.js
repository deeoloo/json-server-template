const jsonServer = require('json-server');
const express = require('express');
const path = require('path');

const server = jsonServer.create();

// Point to db.json using an absolute path
const dbFile = path.join(__dirname, 'db.json');             

const router = jsonServer.router(dbFile);
const middlewares = jsonServer.defaults();

// Serve your images folder (at repo root)
server.use('/images', express.static(path.join(__dirname, 'images')));

server.use(middlewares);
server.use(router);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`JSON Server is running on ${PORT}`);
});