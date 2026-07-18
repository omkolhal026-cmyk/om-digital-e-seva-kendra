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

// Show / Hide Password

document.getElementById("showBtn").onclick=function(){

const pass=document.getElementById("password");

if(pass.type=="password"){

pass.type="text";
this.innerHTML="🙈";

}else{

pass.type="password";
this.innerHTML="👁";

}

}

// Login

function login(){

const btn=document.getElementById("loginBtn");

const u=document.getElementById("username").value.trim();

const p=document.getElementById("password").value.trim();

const error=document.getElementById("error");

error.innerHTML="";

if(u==""||p==""){

error.innerHTML="Enter Username & Password";

return;

}

const user=users.find(x=>x.username===u && x.password===p);

if(user){

btn.disabled=true;

btn.innerHTML="Signing In...";

localStorage.setItem("user",JSON.stringify(user));

setTimeout(()=>{

window.location="dashboard.html";

},800);

}else{

error.innerHTML="Invalid Username or Password";

}

}

document.getElementById("loginBtn").onclick=login;

// Enter Key Login

document.addEventListener("keydown",function(e){

if(e.key==="Enter"){

login();

}

});

// Live Date & Time

function updateClock(){

const now=new Date();

document.getElementById("date").innerHTML=
now.toLocaleDateString();

document.getElementById("time").innerHTML=
now.toLocaleTimeString();

}

updateClock();

setInterval(updateClock,1000);
