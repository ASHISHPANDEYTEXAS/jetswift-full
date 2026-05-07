let isLogin = true;
let currentUserData = null;
let selectedFlight = null;

const API_BASE = "https://jetswift-backend.onrender.com";

window.onload = () => {
    const savedUser = sessionStorage.getItem('jetswift_user');
    if (savedUser) {
        currentUserData = JSON.parse(savedUser);
        enterDashboard();
    }
};

function enterDashboard() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('user-display-name').innerText = currentUserData.name.split(' ')[0];
}

async function submitAuth() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name').value;
    const endpoint = isLogin ? '/login' : '/register';
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await response.json();
        if (response.ok) {
            if (isLogin) {
                currentUserData = data.user;
                sessionStorage.setItem('jetswift_user', JSON.stringify(data.user));
                enterDashboard();
            } else {
                alert("Created! Login now.");
                toggleAuth();
            }
        }
    } catch (err) { alert("Error connecting to server."); }
}

async function findTrip() {
    const origin = document.getElementById('origin').value;
    const destination = document.getElementById('destination').value;
    const date = document.getElementById('travel-date').value;
    const resultsDiv = document.getElementById('results');

    resultsDiv.innerHTML = "<p>Scanning...</p>";
    const res = await fetch(`${API_BASE}/flights/search?origin=${origin}&destination=${destination}&date=${date}`);
    const flights = await res.json();
    
    resultsDiv.innerHTML = "";
    flights.forEach(f => {
        resultsDiv.innerHTML += `
            <div class="glass-panel">
                <h3>${f.airline}</h3>
                <p>${f.origin_name} to ${f.destination_name}</p>
                <h2>₹${f.price}</h2>
                <button onclick="openBookingModal('${f.airline}', '${f.flightNumber}', '${f.origin_name}', '${f.destination_name}', ${f.price}, '${date}')">Book Now</button>
            </div>`;
    });
}

function openBookingModal(airline, flightNo, from, to, price, date) {
    selectedFlight = { airline, flightNo, from, to, price, date };
    document.getElementById('booking-modal').classList.remove('hidden');
}

async function confirmAndPay() {
    const res = await fetch(`${API_BASE}/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: selectedFlight.price })
    });
    const order = await res.json();

    const options = {
        key: "rzp_test_YOUR_KEY", 
        amount: order.amount,
        currency: "INR",
        name: "JETSWIFTFLY",
        order_id: order.id,
        handler: async function (response) {
            // SUCCESS: Save to Database
            await fetch(`${API_BASE}/save-booking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userName: currentUserData.name,
                    userEmail: currentUserData.email,
                    airline: selectedFlight.airline,
                    flightNumber: selectedFlight.flightNo,
                    origin: selectedFlight.from,
                    destination: selectedFlight.to,
                    price: selectedFlight.price,
                    travelDate: selectedFlight.date
                })
            });
            alert("Ticket Booked!");
            location.reload();
        }
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
}
// ... (rest of your existing helper functions like toggleAuth, closeModal, etc)