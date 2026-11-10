const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/db');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join_kitchen', () => {
    socket.join('kitchen');
  });
  socket.on('join_pos', () => {
    socket.join('pos');
  });
});

async function start() {
  try {
    await prisma.$connect();
    server.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`API listening on http://localhost:${env.port}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

if (require.main === module) {
  start();
}

module.exports = { app, server, io };
