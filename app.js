let isLogin = true;
let currentUserData = null;
let selectedFlight = null;

// Backend API URL - Change this to your actual Render URL
const API_BASE = "https://jetswift-full.onrender.com";

// 1. INITIALIZATION & SESSION MANAGEMENT
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
    showSearch();
}

// 2. NAVIGATION & UI TOGGLES
function toggleAuth() {
    isLogin = !isLogin;
    document.getElementById('form-title').innerText = isLogin ? "Neural Login" : "Initialize Account";
    document.getElementById('btn-text').innerText = isLogin ? "Authenticate" : "Initialize";
    document.getElementById('name-group').classList.toggle('hidden', isLogin);
}

// DROPDOWN FIX
function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.classList.toggle('show');
}

// Global click listener to close dropdown when clicking away
window.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown && !e.target.closest('.user-profile-wrapper')) {
        dropdown.classList.remove('show');
    }
});

function showProfile() {
    document.getElementById('booking-section').classList.add('hidden');
    document.getElementById('profile-section').classList.remove('hidden');
    document.getElementById('p-name-display').innerText = currentUserData.name;
    document.getElementById('p-email-display').innerText = currentUserData.email;
}

function showSearch() {
    document.getElementById('profile-section').classList.add('hidden');
    document.getElementById('booking-section').classList.remove('hidden');
}

function handleLogout() {
    sessionStorage.clear();
    location.reload();
}

// 3. AUTHENTICATION LOGIC
async function submitAuth() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name').value;

    if (!email || !password) return alert("Credentials required.");

    const endpoint = isLogin ? '/login' : '/register';
    const bodyData = isLogin ? { email, password } : { name, email, password };

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });

        const data = await response.json();
        if (response.ok) {
            if (isLogin) {
                currentUserData = data.user;
                sessionStorage.setItem('jetswift_user', JSON.stringify(data.user));
                enterDashboard();
            } else {
                alert("Account created. Please login.");
                toggleAuth();
            }
        } else {
            alert(data.error || "Access Denied.");
        }
    } catch (err) {
        alert("Server connection failed.");
    }
}

// 4. FLIGHT SEARCH & RANDOM TIME LOGIC
function getRandomTime() {
    const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
    const mins = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    return `${hours}:${mins}`;
}

async function findTrip() {
    const origin = document.getElementById('origin').value;
    const destination = document.getElementById('destination').value;
    const date = document.getElementById('travel-date').value;
    const resultsDiv = document.getElementById('results');

    if (!origin || !destination || !date) return alert("Please select origin, destination, and date.");

    resultsDiv.innerHTML = `<p style="text-align:center;">Scanning trajectories...</p>`;

    try {
        const url = `${API_BASE}/flights/search?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${date}`;
        const response = await fetch(url);
        const flights = await response.json();

        resultsDiv.innerHTML = "";
        if (!flights || flights.length === 0) return resultsDiv.innerHTML = "<p style='text-align:center;'>No flights found.</p>";

        flights.forEach(f => {
            const flightTime = getRandomTime(); // FIXED: Restore random time
            resultsDiv.innerHTML += `
                <div class="glass-panel" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div>
                        <h3 style="margin:0; color: var(--primary-glow);">${f.airline}</h3>
                        <p style="margin: 5px 0; font-size: 14px; color: var(--text-dim);">${f.flightNumber} | ${date} at ${flightTime}</p>
                        <p style="margin: 0; font-weight: 500;">${f.origin_name || origin} ➔ ${f.destination_name || destination}</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin:0;">₹${f.price}</h2>
                        <button onclick="openBookingModal('${f.airline}', '${f.flightNumber}', '${f.origin_name || origin}', '${f.destination_name || destination}', '${f.price}', '${date}', '${flightTime}')" style="margin-top:10px; padding: 8px 15px;">Book</button>
                    </div>
                </div>`;
        });
    } catch (err) {
        resultsDiv.innerHTML = "Error loading data.";
    }
}

// 5. BOOKING & PAYMENT FLOW
function openBookingModal(airline, flightNo, from, to, price, date, time) {
    selectedFlight = { airline, flightNo, from, to, price, date, time };
    document.getElementById('booking-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('booking-modal').classList.add('hidden');
}

async function confirmAndPay() {
    const age = document.getElementById('book-age').value;
    const mobile = document.getElementById('book-mobile').value;
    const parent = document.getElementById('book-parent').value;
    const address = document.getElementById('book-address').value;

    if (!age || !mobile || !parent || !address) return alert("Fill all passenger details.");

    // Store passenger details temporarily
    currentUserData.age = age;
    currentUserData.parent = parent;
    currentUserData.mobile = mobile;
    currentUserData.address = address;

    try {
        const response = await fetch(`${API_BASE}/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: selectedFlight.price })
        });
        const order = await response.json();

        const options = {
            key: "rzp_test_Skn83hTPivycrT", // Ensure this matches your Razorpay Dashboard
            amount: order.amount,
            currency: "INR",
            name: "JETSWIFTFLY",
            description: `Flight ${selectedFlight.flightNo}`,
            order_id: order.id,
            handler: async function (res) {
                // FIXED: Save booking to database AFTER payment success
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
                        travelDate: `${selectedFlight.date} at ${selectedFlight.time}`
                    })
                });

                alert("Payment Successful! Flight Confirmed.");
                closeModal();
                generatePDFTicket();
            },
            prefill: { name: currentUserData.name, email: currentUserData.email },
            theme: { color: "#00d2ff" }
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
    } catch (err) {
        alert("Payment initialization failed. Please check server connection.");
    }
}

// 6. TICKET GENERATION
function generatePDFTicket() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("JETSWIFTFLY - E-TICKET", 10, 20);
    doc.setFontSize(12);
    doc.text(`Passenger: ${currentUserData.name} (Age: ${currentUserData.age})`, 10, 40);
    doc.text(`Guardian Contact: ${currentUserData.parent}`, 10, 50);
    doc.text(`Contact: ${currentUserData.mobile}`, 10, 60);
    doc.text(`Flight: ${selectedFlight.airline} ${selectedFlight.flightNo}`, 10, 80);
    doc.text(`Route: ${selectedFlight.from} to ${selectedFlight.to}`, 10, 90);
    doc.text(`Date/Time: ${selectedFlight.date} at ${selectedFlight.time}`, 10, 100);
    doc.text(`Status: PAID & CONFIRMED`, 10, 120);
    doc.save(`Ticket_${selectedFlight.flightNo}.pdf`);
}