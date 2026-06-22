"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./config/db");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const queueRoutes_1 = __importDefault(require("./routes/queueRoutes"));
const entryRoutes_1 = __importDefault(require("./routes/entryRoutes"));
dotenv_1.default.config();
// Startup validation for required environment variables
if (!process.env.JWT_SECRET) {
    console.error('CRITICAL ERROR: JWT_SECRET environment variable is missing.');
    process.exit(1);
}
const corsOrigin = (origin, callback) => {
    if (!origin) {
        callback(null, true);
        return;
    }
    if (process.env.FRONTEND_URL) {
        if (origin === process.env.FRONTEND_URL) {
            callback(null, true);
        }
        else {
            callback(null, false);
        }
        return;
    }
    callback(null, true);
};
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
    },
});
// Attach socket server to express app context to use in controllers
app.set('io', io);
// Middleware
app.use((0, cors_1.default)({
    origin: corsOrigin,
    credentials: true,
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Connect Database
(0, db_1.connectDB)().then(async () => {
    // Seed default staff account if none exists
    try {
        const { count, error } = await db_1.supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'staff');
        if (error) {
            console.error('Error querying staff user count:', error);
            return;
        }
        if (count === 0) {
            const salt = await bcryptjs_1.default.genSalt(10);
            const hashedPassword = await bcryptjs_1.default.hash('password123', salt);
            const { error: insertError } = await db_1.supabase.from('users').insert({
                name: 'Default Staff',
                email: 'staff@queue.com',
                password: hashedPassword,
                role: 'staff',
            });
            if (insertError) {
                console.error('Error seeding default user:', insertError);
            }
            else {
                console.log('Seeded default staff user: staff@queue.com / password123');
            }
        }
    }
    catch (error) {
        console.error('Error seeding default user:', error);
    }
});
// Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/queues', queueRoutes_1.default);
app.use('/api/entries', entryRoutes_1.default);
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
