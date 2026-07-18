// ================================
// OM DIGITAL E-SEVA KENDRA
// login.js
// ================================

// Demo Users

const users = [

{
username:"admin",
password:"1234",
role:"Admin"
},

{
username:"om1",
password:"1111",
role:"Operator"
},

{
username:"om2",
password:"2222",
role:"Operator"
},

{
username:"om3",
password:"3333",
role:"Operator"
}

];

// ================================
// Show / Hide Password
// ================================

document.getElementById("showBtn").addEventListener("click",function(){

const pass=document.getElementById("password");

if(pass.type==="password"){

pass.type="text";
this.innerHTML="🙈";

}else{

pass.type="password";
this.innerHTML="👁";

}

});

// ================================
// Login Function
// ================================

function login(){

const username=document.getElementById("username").value.trim();

const password=document.getElementById("password").value.trim();

const btn=document.getElementById("loginBtn");

const error=document.getElementById("error");

error.innerHTML="";

if(username==="" || password===""){

error.style.color="red";
error.innerHTML="Please Enter Username & Password";

return;

}

const user=users.find(x=>x.username===username && x.password===password);

if(!user){

error.style.color="red";
error.innerHTML="Invalid Username or Password";

return;

}

// Save Login Session

localStorage.setItem("user",JSON.stringify(user));

localStorage.setItem("username",user.username);

localStorage.setItem("role",user.role);

// Button Loading

btn.disabled=true;

btn.innerHTML="Signing In...";

// Redirect

setTimeout(function(){

window.location.href="dashboard.html";

},1000);

}

// Login Button

document.getElementById("loginBtn").addEventListener("click",login);

// Enter Key Login

document.addEventListener("keydown",function(e){

if(e.key==="Enter"){

login();

}

});

// ================================
// Date & Time
// ================================

function updateClock(){

const now=new Date();

document.getElementById("date").innerHTML=
now.toLocaleDateString("en-IN");

document.getElementById("time").innerHTML=
now.toLocaleTimeString("en-IN");

}

updateClock();

setInterval(updateClock,1000);

// ================================
// Auto Login
// ================================

if(localStorage.getItem("user")){

window.location.href="dashboard.html";

}
