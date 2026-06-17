import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { connectDB } from './config/db';
import User from './models/User';
import authRoutes from './routes/authRoutes';
import queueRoutes from './routes/queueRoutes';
import entryRoutes from './routes/entryRoutes';

dotenv.config();

// Startup validation for required environment variables
if (!process.env.JWT_SECRET) {
  console.error('CRITICAL ERROR: JWT_SECRET environment variable is missing.');
  process.exit(1);
}

const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin) {
    callback(null, true);
    return;
  }
  if (process.env.FRONTEND_URL) {
    if (origin === process.env.FRONTEND_URL) {
      callback(null, true);
    } else {
      callback(null, false);
    }
    return;
  }
  callback(null, true);
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

// Attach socket server to express app context to use in controllers
app.set('io', io);

// Middleware
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect Database
connectDB().then(async () => {
  // Seed default staff account if none exists
  try {
    const staffCount = await User.countDocuments({ role: 'staff' });
    if (staffCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('password123', salt);
      await User.create({
        name: 'Default Staff',
        email: 'staff@queue.com',
        password: hashedPassword,
        role: 'staff',
      });
      console.log('Seeded default staff user: staff@queue.com / password123');
    }
  } catch (error) {
    console.error('Error seeding default user:', error);
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/entries', entryRoutes);

// Basic health check
app.get('/', (req, res) => {
  res.send('Smart Queue API is running...');
});

// Socket.IO Handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join a specific queue room
  socket.on('join_queue', ({ queueId }) => {
    if (queueId) {
      socket.join(queueId.toString());
      console.log(`Socket ${socket.id} joined room queueId: ${queueId}`);
    }
  });

  // Leave a specific queue room
  socket.on('leave_queue', ({ queueId }) => {
    if (queueId) {
      socket.leave(queueId.toString());
      console.log(`Socket ${socket.id} left room queueId: ${queueId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
