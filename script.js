async function searchFlights() {
    const from = document.getElementById('from').value;
    const to = document.getElementById('to').value;

    // This calls your Node.js backend port 5000
    const response = await fetch(`http://localhost:5000/flights?origin=${from}&destination=${to}`);
    const flights = await response.json();
    
    displayFlights(flights);
    displayHotels(to); // Suggest hotels based on destination
}

function displayHotels(destination) {
    const hotelDiv = document.getElementById('hotels');
    // Dummy data for now - in a real app, you'd fetch this from a Hotel API
    hotelDiv.innerHTML = `
        <div class="card">
            <h4>Grand ${destination} Plaza</h4>
            <p>0.5 miles from Airport</p>
            <p>⭐ 4.5/5</p>
        </div>
    `;
}