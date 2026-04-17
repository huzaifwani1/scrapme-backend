const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const genToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Please fill all fields' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    if (await User.findOne({ email }))
      return res.status(409).json({ message: 'Email already registered. Please login.' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });
    res.status(201).json({ token: genToken(user._id), user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) { next(err); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Please fill all fields' });

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: 'Invalid credentials. Please sign up first.' });

    res.json({ token: genToken(user._id), user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) { next(err); }
};

const me = async (req, res, next) => {
  try {
    res.json({ id: req.user._id, name: req.user.name, email: req.user.email });
  } catch (err) { next(err); }
};

// ─── PASSWORD RESET ───────────────────────────────────
const emailService = require('../utils/emailService');

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Please enter your email' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account found with that email' });

    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const hashed = crypto.createHash('sha256').update(code).digest('hex');

    user.resetToken = hashed;
    user.resetTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    // Send email with reset code
    const emailSent = await emailService.sendPasswordResetEmail(email, code, user.name);

    if (!emailSent) {
      console.warn(`⚠️ Failed to send email to ${email}. Reset code: ${code}`);
    }

    // Always return success message (security best practice - don't reveal if email exists)
    res.json({
      message: 'If an account exists with this email, a password reset code has been sent.',
      // In development, still return the code for testing (remove in production)
      ...(process.env.NODE_ENV !== 'production' && { resetCode: code })
    });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword)
      return res.status(400).json({ message: 'Please fill all fields' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const hashed = crypto.createHash('sha256').update(code).digest('hex');
    const user = await User.findOne({
      email,
      resetToken: hashed,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset code' });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json({ message: 'Password reset successful! You can now login.' });
  } catch (err) { next(err); }
};

module.exports = { register, login, me, forgotPassword, resetPassword };
