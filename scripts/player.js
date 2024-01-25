function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            // if data.isPlaying = true, then display the now playing panel
            if (data.isPlaying == true) {

                document.getElementById("player_image").src = data.nowPlaying.imageUrl;
                document.getElementById("player_title").innerHTML = data.nowPlaying.name + " • " + data.nowPlaying.artist;
                document.getElementById("player_link").href = data.nowPlaying.url;

                console.log(`Now playing: ${data.nowPlaying.name} by ${data.nowPlaying.artist}\nArt: ${data.nowPlaying.imageUrl}\nUrl: ${data.nowPlaying.url}\n`);
            } else {
                console.log("Playback stopped.");

                document.getElementById("player_image").src = data.nowPlaying.imageUrl;
                document.getElementById("player_title").innerHTML = "[LAST PLAYED] " + data.nowPlaying.name + " • " + data.nowPlaying.artist;
                document.getElementById("player_link").href = data.nowPlaying.url;
            };
        });
}

// Fetch and display time immediately and then every 10 seconds
fetchAndDisplayTime();
setInterval(fetchAndDisplayTime, 10000);
