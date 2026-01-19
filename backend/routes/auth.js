 const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');

// Validation middleware
const validateRegister = [
  check('name')
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  check('email')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  check('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain letters and numbers'),
  check('studentId')
    .optional()
    .matches(/^SIT\d{6}$/).withMessage('Student ID must be in format SITYYYYXX')
];

const validateLogin = [
  check('email')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  check('password')
    .notEmpty().withMessage('Password is required')
];

// Register
router.post('/register', validateRegister, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, name, role, studentId, department, phone } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [
        { email },
        ...(studentId ? [{ studentId }] : [])
      ]
    });
    
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: 'User with this email or student ID already exists' 
      });
    }
    
    // Create avatar initials
    const avatar = name.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
    
    // Generate random color for avatar
    const avatarColor = `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
    
    // Create new user
    const user = new User({
      email,
      password,
      name,
      role: role || 'Member',
      studentId,
      department,
      phone,
      avatar,
      avatarColor,
      performance: {
        meetingsAttended: 0,
        tasksCompleted: 0,
        rating: 0,
        streak: 1,
        achievements: [],
        points: 0
      },
      preferences: {
        theme: 'light',
        notifications: true,
        autoSave: true
      }
    });
    
    await user.save();
    
    // Create token
    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    // Set token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    // Don't send password in response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: userResponse
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Login
router.post('/login', validateLogin, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }
    
    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact administrator.'
      });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }
    
    // Update last login and increment streak
    user.lastLogin = new Date();
    user.performance.streak += 1;
    await user.save();
    
    // Create token
    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    // Set token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    // Don't send password in response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    // Emit login notification via socket
    const io = req.app.get('io');
    io.to(`user-${user._id}`).emit('userLoggedIn', {
      userId: user._id,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userResponse
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Google OAuth Routes
router.get('/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/login',
    failureFlash: true 
  }),
  async (req, res) => {
    try {
      const user = req.user;
      
      // Create token
      const token = jwt.sign(
        { 
          userId: user._id,
          role: user.role,
          email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );
      
      // Redirect to frontend with token
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${token}`;
      res.redirect(redirectUrl);
      
    } catch (error) {
      console.error('Google OAuth error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  }
);

// Logout
router.post('/logout', async (req, res) => {
  try {
    // Clear token cookie
    res.clearCookie('token');
    
    // Clear session
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
    });
    
    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
    });
    
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Logout failed' 
    });
  }
});

// Get current user
router.get('/me', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -__v')
      .lean();
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true, 
      user 
    });
    
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get user data' 
    });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }
    
    // Verify current token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Create new token
    const newToken = jwt.sign(
      { 
        userId: user._id,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    // Set new token in cookie
    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({
      success: true,
      message: 'Token refreshed',
      token: newToken
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to refresh token' 
    });
  }
});

// Forgot password request
router.post('/forgot-password', [
  check('email').isEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal that user doesn't exist for security
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link'
      });
    }
    
    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user._id, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // In production, you would:
    // 1. Save reset token to database with expiry
    // 2. Send email with reset link
    // 3. Log this action
    
    // For demo, just return the token
    res.json({
      success: true,
      message: 'Password reset link generated',
      resetToken, // In production, don't send this in response
      resetLink: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process request' 
    });
  }
});

// Reset password
router.post('/reset-password', [
  check('token').notEmpty().withMessage('Token is required'),
  check('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain letters and numbers')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token, password } = req.body;
    
    // Verify reset token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'password_reset') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid reset token' 
      });
    }
    
    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Update password
    user.password = password;
    await user.save();
    
    // In production, you would:
    // 1. Invalidate all existing sessions
    // 2. Send confirmation email
    // 3. Log this action
    
    res.json({
      success: true,
      message: 'Password reset successful'
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired reset token' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset password' 
    });
  }
});

// Change password (authenticated users)
router.post('/change-password', 
  passport.authenticate('jwt', { session: false }),
  [
    check('currentPassword').notEmpty().withMessage('Current password is required'),
    check('newPassword')
      .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('New password must contain letters and numbers')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { currentPassword, newPassword } = req.body;
      const user = req.user;
      
      // Verify current password
      const isPasswordValid = await user.comparePassword(currentPassword);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'Current password is incorrect' 
        });
      }
      
      // Update password
      user.password = newPassword;
      await user.save();
      
      // Invalidate all sessions except current
      // (In a real app, you might want to implement this)
      
      res.json({
        success: true,
        message: 'Password changed successfully'
      });
      
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to change password' 
      });
    }
  }
);

// Update profile
router.put('/profile', 
  passport.authenticate('jwt', { session: false }),
  [
    check('name').optional().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    check('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
    check('department').optional().isLength({ min: 2 }).withMessage('Department must be at least 2 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const updates = req.body;
      const user = req.user;
      
      // Remove restricted fields
      delete updates.email;
      delete updates.password;
      delete updates.role;
      delete updates.studentId;
      
      // Update user
      Object.keys(updates).forEach(key => {
        if (key === 'preferences' && updates[key]) {
          // Merge preferences instead of replacing
          user.preferences = { ...user.preferences, ...updates[key] };
        } else {
          user[key] = updates[key];
        }
      });
      
      await user.save();
      
      // Don't send password in response
      const userResponse = user.toObject();
      delete userResponse.password;
      
      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: userResponse
      });
      
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to update profile' 
      });
    }
  }
);

// Verify email (for future implementation)
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'email_verification') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid verification token' 
      });
    }
    
    // Find user and verify email
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    user.isEmailVerified = true;
    await user.save();
    
    // Redirect to frontend success page
    res.redirect(`${process.env.FRONTEND_URL}/email-verified`);
    
  } catch (error) {
    console.error('Email verification error:', error);
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.redirect(`${process.env.FRONTEND_URL}/email-verification-failed?error=invalid_token`);
    }
    
    res.redirect(`${process.env.FRONTEND_URL}/email-verification-failed?error=server_error`);
  }
});

// Check if email exists (for registration form)
router.get('/check-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const user = await User.findOne({ email }).select('_id');
    
    res.json({
      success: true,
      exists: !!user
    });
    
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check email' 
    });
  }
});

// Check if student ID exists
router.get('/check-student-id/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const user = await User.findOne({ studentId }).select('_id');
    
    res.json({
      success: true,
      exists: !!user
    });
    
  } catch (error) {
    console.error('Check student ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check student ID' 
    });
  }
});

// Get user statistics
router.get('/stats/:userId', 
  passport.authenticate('jwt', { session: false }),
  async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Check if user is authorized (admin or viewing own stats)
      if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
        return res.status(403).json({ 
          success: false, 
          message: 'Not authorized to view these statistics' 
        });
      }
      
      const user = await User.findById(userId)
        .select('performance name role avatar avatarColor')
        .lean();
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      res.json({
        success: true,
        stats: user.performance,
        user: {
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          avatarColor: user.avatarColor
        }
      });
      
    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to get user statistics' 
      });
    }
  }
);

module.exports = router;
