// Playlist
const songs = [
  "Songs/Cyclone.mp3",
  "Songs/Song2.mp3",
  "Songs/Song3.mp3",
  "Songs/Song4.mp3"
];

let currentIndex = 0;
const player = document.getElementById("player");
const songTitle = document.getElementById("songTitle");

// Load first song
player.src = songs[currentIndex];
songTitle.innerText = "Now Playing: " + songs[currentIndex].split("/").pop();

function playSong() { player.play(); }
function pauseSong() { player.pause(); }

function nextSong() {
  currentIndex = (currentIndex + 1) % songs.length;
  player.src = songs[currentIndex];
  songTitle.innerText = "Now Playing: " + songs[currentIndex].split("/").pop();
  player.play();
}

function prevSong() {
  currentIndex = (currentIndex - 1 + songs.length) % songs.length;
  player.src = songs[currentIndex];
  songTitle.innerText = "Now Playing: " + songs[currentIndex].split("/").pop();
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
