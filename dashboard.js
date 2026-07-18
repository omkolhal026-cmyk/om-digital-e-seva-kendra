const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxcYjY5sMXMPT8g1hEFMdT62YXrUPeSypUksN9t4lngDMBbGQxil_4Nb3azkiz804QN/exec?action=dashboard";

// Login Check
const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
    window.location.href = "login.html";
}

// Welcome
document.getElementById("welcome").innerHTML =
"👤 Welcome " + user.username;

// Dashboard Data
loadDashboard();

async function loadDashboard() {

    try {

        const response = await fetch(SCRIPT_URL);

        const data = await response.json();

        document.getElementById("todayReg").innerHTML = data.todayRegistration;
        document.getElementById("todayRen").innerHTML = data.todayRenewal;

        document.getElementById("totalReg").innerHTML = data.totalRegistration;
        document.getElementById("totalRen").innerHTML = data.totalRenewal;

    } catch (err) {

        console.log(err);

    }

}

// Logout
document.getElementById("logoutBtn").onclick = logout;
document.getElementById("logoutBtn2").onclick = logout;

function logout(){

    localStorage.removeItem("user");

    window.location.href = "login.html";

}
