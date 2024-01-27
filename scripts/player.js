let currentProgress = 0;
let currentDuration = 0;

function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            if (data.isPlaying == true) {

                if (data.albumArt === null) {
                    console.log("local file");
                }

                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;

                currentProgress = data.progress;
                currentDuration = data.duration;
            } else {
                document.getElementById("player_image").src = data.albumArt;
                document.getElementById("player_title").innerHTML = "[LAST PLAYED] " + data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;

                // Reset progress when playback stops
                currentProgress = 0;
            }
        });
}

function updateFakeProgressBar() {
    // Calculate the progress percentage
    const progressPercentage = (currentProgress / currentDuration) * 100;

    // calculate how many updates are need by comparing the current progress to the duration
    const durationComp = currentDuration - currentProgress;
    const duration = Math.round(durationComp / 1000);
    const songLength = Math.round(currentDuration / 1000);
    console.log(`Duration: ${duration}\nSong length: ${songLength}`);


    // Update the progress bar
    document.getElementById("player_progress").style.width = progressPercentage + "%";
    // each second, add however much the progress bar has progressed
    currentProgress += 1000;

    // if 100 is reached, call fetchAndDisplayTime() to get the new song
    if (currentProgress >= currentDuration) {
        fetchAndDisplayTime();
    }
}

// Fetch and display time immediately and then every 10 seconds
fetchAndDisplayTime();
setInterval(fetchAndDisplayTime, 10000);

// Update fake progress every second
setInterval(updateFakeProgressBar, 1000);
