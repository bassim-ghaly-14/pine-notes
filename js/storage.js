export function saveNotes(notes){
  localStorage.setItem("pine-notes", JSON.stringify(notes));
}

export function getNotes(){
  return JSON.parse(localStorage.getItem("pine-notes")) || [];
}