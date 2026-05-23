import "./theme.js";

import { addNote, renderNotes } from "./notes.js";

const addNoteBtn = document.getElementById("addNoteBtn");

const noteTitle = document.getElementById("noteTitle");

const noteContent = document.getElementById("noteContent");

const noteCategory = document.getElementById("noteCategory");

const searchInput = document.getElementById("searchInput");

const currentYear = document.getElementById("currentYear");

currentYear.textContent = new Date().getFullYear();

renderNotes();

addNoteBtn.onclick = () => {

  if(
    noteTitle.value.trim() === "" ||
    noteContent.value.trim() === ""
  ){
    return;
  }

  const note = {

    title: noteTitle.value,

    content: noteContent.value,

    category: noteCategory.value,

    pinned:false,

    createdAt:new Date().toLocaleString("en-US",{
          weekday:"short",
          year:"numeric",
          month:"long",
          day:"numeric",
          hour:"2-digit",
          minute:"2-digit"
})

  };

  addNote(note);

  noteTitle.value = "";
  noteContent.value = "";

};

searchInput.oninput = () => {

  renderNotes(searchInput.value);

};