function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            // if data.isPlaying = true, then display the now playing panel
            if (data.isPlaying == true) {

                // if image is available, display it, otherwise display the default image
                if (data.albumArt != null) {
                    document.getElementById("player_image").src =  data.albumArt;
                } else {
                    document.getElementById("player_image").src =  "./styles/blank.png";
                }

                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;
                document.getElementById("player_title").style.padding = "6px";

                console.log(`Now playing: ${data.name} by ${data.artist}\nArt: ${data.albumArt}\nUrl: ${data.url}\n`);
            } else {
                console.log("Playback stopped.");

                document.getElementById("player_image").src =  data.albumArt;
                document.getElementById("player_title").innerHTML = "[LAST PLAYED] " + data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;
            };
        });
}

// Fetch and display time immediately and then every 10 seconds
fetchAndDisplayTime();
setInterval(fetchAndDisplayTime, 10000);
