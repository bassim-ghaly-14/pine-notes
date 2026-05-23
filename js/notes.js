import { saveNotes, getNotes } from "./storage.js";
import { showToast } from "./ui.js";

let notes = getNotes();

const notesGrid = document.getElementById("notesGrid");

const deleteModal = document.getElementById("deleteModal");

const confirmDelete = document.getElementById("confirmDelete");

const cancelDelete = document.getElementById("cancelDelete");

let currentDeleteIndex = null;

function sortNotes(){
  notes.sort((a,b) => b.pinned - a.pinned);
}

export function renderNotes(search = ""){

  sortNotes();

  notesGrid.innerHTML = "";

  const filtered = notes.filter(note => {

    const query = search.toLowerCase();

    return (
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query) ||
      note.category.toLowerCase().includes(query)
    );

  });

  if(filtered.length === 0){

    notesGrid.innerHTML = `
      <div class="empty-notes">
        <h3>No Notes Found</h3>
        <p>Try adding a new note ✨</p>
      </div>
    `;

    return;
  }

  filtered.forEach((note, index) => {

    notesGrid.innerHTML += `
      <div class="note-card ${note.pinned ? "pinned" : ""}">

        ${
          note.pinned
          ?
          `<span class="pinned-badge"> 
            <img src="https://www.svgrepo.com/show/524815/pin.svg" alt="Pinned" width="14">
          </span>`
          :
          ""
        }

        <h3>${note.title}</h3>

        <p>${note.content}</p>

        <span class="note-category">
          ${note.category}
        </span>

        <span class="note-date">
          ${note.createdAt || ""}
        </span>

        <div class="note-actions">

          <button
            class="pin-btn"
            onclick="pinNote(${index})"
          >
            <img src="https://www.svgrepo.com/show/524815/pin.svg" alt="Pin Note" width="18">
          </button>

          <button
            class="delete-btn"
            onclick="openDeleteModal(${index})"
          >
            <img src="https://www.svgrepo.com/show/490950/delete.svg" alt="Delete Note" width="18">
          </button>

        </div>

      </div>
    `;

  });

}

export function addNote(note){

  notes.unshift(note);

  saveNotes(notes);

  renderNotes();

  showToast("Note Added","success");

}

window.openDeleteModal = function(index){

  currentDeleteIndex = index;

  deleteModal.classList.add("show");

}

cancelDelete.onclick = () => {

  deleteModal.classList.remove("show");

}

confirmDelete.onclick = () => {

  if(currentDeleteIndex !== null){

    notes.splice(currentDeleteIndex,1);

    saveNotes(notes);

    renderNotes();

    showToast("Note Deleted","danger");

    deleteModal.classList.remove("show");

  }

}

window.pinNote = function(index){

  notes[index].pinned = !notes[index].pinned;

  saveNotes(notes);

  renderNotes();

  if(notes[index].pinned){
    showToast("Note Pinned","warning");
  } else {
    showToast("Note Unpinned","success");
  }

}
// chef-belly