// show sections

function showSection(id){

document.querySelectorAll(".section").forEach(section => {
section.classList.remove("active")
})

document.getElementById(id).classList.add("active")

}


// default

showSection("profile")



// save profile

function saveProfile(){

const name=document.getElementById("name").value
const username=document.getElementById("username").value
const email=document.getElementById("email").value

const user={name,username,email}

localStorage.setItem("userProfile",JSON.stringify(user))

alert("تم حفظ البيانات")

}



// theme toggle

const toggle=document.getElementById("themeToggle")

toggle.addEventListener("change",()=>{

if(toggle.checked){

document.body.style.background="#1e1e1e"

}else{

document.body.style.background="#f4f7fa"

}

})