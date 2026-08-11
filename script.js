let songs = [];
let currentIndex = 0;
const player = document.getElementById("player");
const songTitle = document.getElementById("songTitle");

// Load playlist.json dynamically
fetch("playlist.json")
  .then(response => response.json())
  .then(data => {
    songs = data.songs;
    if (songs.length > 0) {
      player.src = songs[currentIndex];
      updateTitle();
    }
  });

function updateTitle() {
  songTitle.innerText = "Now Playing: " + songs[currentIndex].split("/").pop();
}

function playSong() { player.play(); }
function pauseSong() { player.pause(); }

function nextSong() {
  currentIndex = (currentIndex + 1) % songs.length;
  player.src = songs[currentIndex];
  updateTitle();
  player.play();
}

function prevSong() {
  currentIndex = (currentIndex - 1 + songs.length) % songs.length;
  player.src = songs[currentIndex];
  updateTitle();
  player.play();
}

// Clock (IST)
function updateClock() {
  const now = new Date();
  document.getElementById("clock").innerText =
    "🕒 " + now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
}
setInterval(updateClock, 1000);
updateClock();
