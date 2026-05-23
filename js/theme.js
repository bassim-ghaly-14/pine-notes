const themeBtn = document.getElementById("themeBtn");
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "Light"){
  document.body.classList.toggle("light");
  themeBtn.textContent = "☀"
} else {
  themeBtn.textContent = "☾"
}

themeBtn.onclick = () => {
  document.body.classList.toggle("light");
  if (document.body.classList.contains("light")){
    themeBtn.textContent = "☀";
    localStorage.setItem("theme", "light");
  } else {
    themeBtn.textContent = "☾";
    localStorage.setItem("theme", "dark");
  }
};