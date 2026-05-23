export function showToast(message,type = "success"){

  const toast = document.getElementById("toast");

  toast.textContent = message;

  toast.className = "";

  toast.classList.add("show");

  if(type === "success"){
    toast.classList.add("toast-success");
  }

  if(type === "danger"){
    toast.classList.add("toast-danger");
  }

  if(type === "warning"){
    toast.classList.add("toast-warning");
  }

  setTimeout(() => {

    toast.classList.remove("show");

  }, 2000);

}