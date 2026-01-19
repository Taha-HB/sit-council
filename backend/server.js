require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const socketio = require('socket.io');
const http = require('http');
const MongoStore = require('connect-mongo');
const morgan = require('morgan');

// Import routes
const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const userRoutes = require('./routes/users');
const performanceRoutes = require('./routes/performance');
const pdfRoutes = require('./routes/pdf');
const notificationRoutes = require('./routes/notifications');
const agendaRoutes = require('./routes/agenda');
const attendanceRoutes = require('./routes/attendance');
const settingsRoutes = require('./routes/settings');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const { authenticate } = require('./middleware/authMiddleware');

// Initialize app
const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = socketio(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Store io instance for use in routes
app.set('io', io);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sit-council', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// MongoDB session store
const mongoStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/sit-council',
  collectionName: 'sessions',
  ttl: 24 * 60 * 60, // 24 hours
  autoRemove: 'native'
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://accounts.google.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "http://localhost:3000"],
      connectSrc: ["'self'", process.env.BACKEND_URL || "http://localhost:5000", "ws://localhost:5000"],
      frameSrc: ["'self'", "https://accounts.google.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Compression
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ["http://localhost:3000"],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Preflight requests
app.options('*', cors(corsOptions));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

// More strict rate limiting for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.'
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'sit-council-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  store: mongoStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'sit_council_session'
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());
require('./config/passport')(passport);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '..', 'Frontend');
  app.use(express.static(frontendPath));
  
  // Serve the main HTML file for all non-API routes
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  // Development routes
  app.get('/', (req, res) => {
    res.json({ 
      message: '🚀 SIT Council API is running',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      docs: process.env.BACKEND_URL + '/api-docs' || 'http://localhost:5000/api-docs'
    });
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memoryUsage: process.memoryUsage()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/agenda', agendaRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/settings', settingsRoutes);

// Socket.io event handlers
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  // Join user to their room
  socket.on('joinUser', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`👤 User ${userId} joined their room`);
  });
  
  // Join meeting room
  socket.on('joinMeeting', ({ meetingId, userId }) => {
    socket.join(`meeting-${meetingId}`);
    console.log(`📅 User ${userId} joined meeting ${meetingId}`);
    
    // Notify others in the meeting
    socket.to(`meeting-${meetingId}`).emit('userJoined', {
      userId,
      timestamp: new Date().toISOString()
    });
  });
  
  // Real-time minutes editing
  socket.on('updateMinutes', (data) => {
    const { meetingId, minutes, userId } = data;
    io.to(`meeting-${meetingId}`).emit('minutesUpdated', {
      minutes,
      userId,
      timestamp: new Date().toISOString()
    });
  });
  
  // Real-time attendance updates
  socket.on('updateAttendance', (data) => {
    const { meetingId, attendance, userId } = data;
    io.to(`meeting-${meetingId}`).emit('attendanceUpdated', {
      attendance,
      userId,
      timestamp: new Date().toISOString()
    });
  });
  
  // Chat messages
  socket.on('sendMessage', (data) => {
    const { meetingId, message, user } = data;
    const messageData = {
      ...message,
      timestamp: new Date().toISOString(),
      id: Date.now().toString()
    };
    
    io.to(`meeting-${meetingId}`).emit('newMessage', messageData);
  });
  
  // Notifications
  socket.on('sendNotification', (data) => {
    const { userId, notification } = data;
    io.to(`user-${userId}`).emit('newNotification', {
      ...notification,
      timestamp: new Date().toISOString(),
      read: false
    });
  });
  
  // Live agenda updates
  socket.on('updateAgenda', (data) => {
    const { meetingId, agenda, userId } = data;
    io.to(`meeting-${meetingId}`).emit('agendaUpdated', {
      agenda,
      userId,
      timestamp: new Date().toISOString()
    });
  });
  
  // Disconnect handler
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server gracefully...');
  server.close(() => {
    console.log('Server closed.');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed.');
      process.exit(0);
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
    🚀 Server started on port ${PORT}
    📁 Environment: ${process.env.NODE_ENV || 'development'}
    🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}
    🔗 Backend URL: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}
    🗄️  Database: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}
    ⚡ Real-time: WebSocket server initialized
  `);
});

module.exports = { app, server, io };
