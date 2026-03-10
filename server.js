const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' })); 

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'worldclass123';
const SECRET_KEY = 'super_secret_matrimony_key';

const DB_URL = process.env.MONGODB_URI || 'mongodb://localhost:27017/matrimonyMVP';

mongoose.connect(DB_URL)
  .then(() => console.log('✅ Connected to MongoDB!'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  dob: String, 
  gender: String,
  city: String,
  phone: String,
  biodata: String,
  photos: [String], 
  isApproved: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'Access Denied: Please log in again.' });
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Session expired. Please log in again.' });
    req.user = decoded;
    next();
  });
};

app.post('/api/client/register', async (req, res) => {
  try {
    if (!req.body.photos || req.body.photos.length === 0) {
      return res.status(400).json({ error: 'Please upload a profile photo.' });
    }
    await new User(req.body).save();
    res.status(201).json({ message: 'Registration successful! Your profile is pending Admin approval.' });
  } catch (error) { res.status(500).json({ error: 'Username taken or data too large.' }); }
});

app.post('/api/client/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ error: 'Invalid username or password.' });
  if (!user.isApproved) return res.status(403).json({ error: 'Account is pending Admin approval.' });

  const token = jwt.sign({ id: user._id, isPremium: user.isPremium }, SECRET_KEY, { expiresIn: '24h' });
  res.json({ token, isPremium: user.isPremium, name: user.name });
});

app.get('/api/client/matches', verifyToken, async (req, res) => {
  try {
    const loggedInUser = await User.findById(req.user.id);
    const allApproved = await User.find({ isApproved: true });
    
    const oppositeGenderMatches = allApproved.filter(u => 
      u.gender !== loggedInUser.gender && u._id.toString() !== req.user.id
    );

    const matches = oppositeGenderMatches.map(u => ({
        _id: u._id, name: u.name, dob: u.dob, gender: u.gender, city: u.city, biodata: u.biodata,
        phone: req.user.isPremium ? u.phone : 'Upgrade to Premium to view',
        photos: u.photos.length > 0 ? [u.photos[0]] : []
    }));
    res.status(200).json(matches);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch matches.' }); }
});

app.get('/api/client/profile', verifyToken, async (req, res) => {
  try { res.status(200).json(await User.findById(req.user.id)); } 
  catch (error) { res.status(500).json({ error: 'Failed to load profile.' }); }
});

app.put('/api/client/profile', verifyToken, async (req, res) => {
  try {
    const { name, dob, gender, city, phone, biodata, photos } = req.body;
    const updateData = { name, dob, gender, city, phone, biodata };
    if (photos && photos.length > 0) { updateData.photos = photos; }
    await User.findByIdAndUpdate(req.user.id, updateData);
    res.status(200).json({ message: 'Profile updated successfully!' });
  } catch (error) { res.status(500).json({ error: 'Failed to update profile.' }); }
});

app.post('/api/admin/login', (req, res) => {
  if (req.body.username === ADMIN_USER && req.body.password === ADMIN_PASS) {
    res.json({ token: jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '12h' }) });
  } else { res.status(401).json({ error: 'Invalid Admin credentials.' }); }
});

app.get('/api/admin/users', verifyToken, async (req, res) => {
  res.status(200).json(await User.find());
});

app.patch('/api/admin/users/:id/approve', verifyToken, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isApproved: true });
  res.status(200).json({ message: 'User Approved' });
});

app.patch('/api/admin/users/:id/premium', verifyToken, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { isPremium: req.body.isPremium });
  res.status(200).json({ message: 'Premium Status Updated' });
});

app.delete('/api/admin/users/:id', verifyToken, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'User Deleted' });
});

module.exports = app;
