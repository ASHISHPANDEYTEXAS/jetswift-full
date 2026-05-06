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
    "https://www.jetswiftfly.in"
];

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

app.use(express.json());

const frontendPath = path.join(__dirname, '../frontend');
app.use('/frontend', express.static(frontendPath));

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID, 
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Initialize Duffel
const duffel = new Duffel({
    token: process.env.DUFFEL_ACCESS_TOKEN,
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// User Schema
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    age: Number,
    pass_mobile: String,
    par_mobile: String,
    country: String,
    state: String,
    district: String
});

const User = mongoose.model('User', UserSchema);

// Helper function to resolve City Names to IATA Codes
async function resolveCityToIata(cityName) {
    try {
        const response = await duffel.suggestions.list({ query: cityName });
        // Returns the first/best match (e.g., "Delhhi" -> "DEL")
        if (response.data && response.data.length > 0) {
            return {
                code: response.data[0].iata_code,
                name: response.data[0].name
            };
        }
        return null;
    } catch (error) {
        console.error(`Error resolving city ${cityName}:`, error);
        return null;
    }
}

// 1. Register Route
app.post('/register', async (req, res) => {
    try {
        const { name, email, password, age, pass_mobile, par_mobile, country, state, district } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword, age, pass_mobile, par_mobile, country, state, district });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Registration failed." });
    }
});

// 2. Login Route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '1h' });
    res.json({ message: "Login successful", token, user: {
            name: user.name,
            email: user.email, // Added for frontend prefill
            age: user.age,
            pass_mobile: user.pass_mobile,
            address: `${user.district}, ${user.state}, ${user.country}`
        } 
    });
});

/**
 * Updated search to handle Full Names and Spelling Correction
 */
app.get('/flights/search', async (req, res) => {
    try {
        const { origin, destination, date } = req.query;

        if (!origin || !destination) {
            return res.status(400).json({ error: "Origin and Destination names are required." });
        }

        // Resolve names to IATA codes (Delhi -> DEL)
        const originInfo = await resolveCityToIata(origin);
        const destInfo = await resolveCityToIata(destination);

        if (!originInfo || !destInfo) {
            return res.status(404).json({ error: "Could not identify cities. Check your spelling." });
        }

        // Use the selected date from frontend, or a default future date
        const searchDate = date || "2026-06-20";

        const searchResponse = await duffel.offerRequests.create({
            slices: [
                {
                    origin: originInfo.code, 
                    destination: destInfo.code, 
                    departure_date: searchDate,
                },
            ],
            passengers: [{ type: "adult" }],
            cabin_class: "economy",
        });

        const flights = searchResponse.data.offers.map(offer => ({
            airline: offer.owner.name,
            flightNumber: offer.id.split('_').pop().toUpperCase().substring(0, 6),
            origin: originInfo.code,
            origin_name: originInfo.name,
            destination: destInfo.code,
            destination_name: destInfo.name,
            price: Math.round(offer.total_amount),
            date: searchDate
        }));

        res.json(flights);
    } catch (err) {
        console.error("Duffel API Error:", err);
        res.status(500).json({ error: "Failed to fetch flights." });
    }
});

// 3. Razorpay Order Route
app.post('/create-order', async (req, res) => {
    try {
        const options = {
            amount: Math.round(req.body.amount * 100), 
            currency: "INR",
            receipt: `receipt_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);
        res.status(200).json(order);
    } catch (err) {
        res.status(500).json({ error: "Razorpay order failed" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));