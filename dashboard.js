// Dashboard JS

document.addEventListener("DOMContentLoaded", function () {

    // Login Session Check
    let user = localStorage.getItem("username");

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // User Name Display
    const userSpan = document.querySelector(".admin span");
    if (userSpan) {
        userSpan.innerText = user;
    }

    // Demo Data
    let totalEntry = 0;
    let totalAmount = 0;

    let claims = JSON.parse(localStorage.getItem("claims")) || [];

    totalEntry = claims.length;

    claims.forEach(c => {
        totalAmount += Number(c.total || 0);
    });

    document.getElementById("today").innerText = totalEntry;
    document.getElementById("amount").innerText = "₹" + totalAmount;

    // Recent Claim List
    let table = document.getElementById("claimTable");

    if (claims.length > 0) {

        table.innerHTML = "";

        claims.slice().reverse().forEach(c => {

            table.innerHTML += `
            <tr>
                <td>${c.name}</td>
                <td>${c.mh}</td>
                <td>${c.taluka}</td>
                <td>₹${c.total}</td>
                <td>${c.date}</td>
            </tr>
            `;

        });

    }

});

// Logout
function logout() {

    localStorage.removeItem("username");

    window.location.href = "index.html";

}
