require('dotenv').config();
const Razorpay = require('razorpay');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Duffel } = require('@duffel/api'); 
const app = express();

const allowedOrigins = [
    "https://jetswiftfly.in",
    "https://www.jetswiftfly.in",
    "http://127.0.0.1:5500" // For local testing
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS policy violation'), false);
        }
        return callback(null, true);
    }
}));

app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// --- SCHEMAS ---

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    age: Number,
    pass_mobile: String,
    address: String
});

// NEW: Booking Schema to track ticket history
const BookingSchema = new mongoose.Schema({
    userName: String,
    userEmail: String,
    airline: String,
    flightNumber: String,
    origin: String,
    destination: String,
    price: Number,
    travelDate: String,
    bookedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Booking = mongoose.model('Booking', BookingSchema);

// --- INITIALIZATIONS ---

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID, 
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const duffel = new Duffel({
    token: process.env.DUFFEL_ACCESS_TOKEN,
});

async function resolveCityToIata(cityName) {
    try {
        const response = await duffel.suggestions.list({ query: cityName });
        if (response.data && response.data.length > 0) {
            return { code: response.data[0].iata_code, name: response.data[0].name };
        }
        return null;
    } catch (error) {
        return null;
    }
}

// --- ROUTES ---

app.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: "Success" });
    } catch (err) {
        res.status(500).json({ error: "Registration failed." });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id }, 'secret_key', { expiresIn: '1h' });
    res.json({ user: { name: user.name, email: user.email } });
});

app.get('/flights/search', async (req, res) => {
    try {
        const { origin, destination, date } = req.query;
        const originInfo = await resolveCityToIata(origin);
        const destInfo = await resolveCityToIata(destination);
        if (!originInfo || !destInfo) return res.status(404).json({ error: "City not found" });

        const searchResponse = await duffel.offerRequests.create({
            slices: [{ origin: originInfo.code, destination: destInfo.code, departure_date: date }],
            passengers: [{ type: "adult" }],
            cabin_class: "economy",
        });

        const flights = searchResponse.data.offers.map(offer => ({
            airline: offer.owner.name,
            flightNumber: offer.id.split('_').pop().substring(0, 6),
            origin_name: originInfo.name,
            destination_name: destInfo.name,
            price: Math.round(offer.total_amount)
        }));
        res.json(flights);
    } catch (err) {
        res.status(500).json({ error: "Search failed" });
    }
});

app.post('/create-order', async (req, res) => {
    const options = { amount: req.body.amount * 100, currency: "INR", receipt: `rec_${Date.now()}` };
    const order = await razorpay.orders.create(options);
    res.json(order);
});

// NEW: Save booking after payment
app.post('/save-booking', async (req, res) => {
    try {
        const newBooking = new Booking(req.body);
        await newBooking.save();
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to log booking" });
    }
});

// NEW: Admin route to get stats
app.get('/admin/stats', async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ bookedAt: -1 });
        res.json(bookings);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));