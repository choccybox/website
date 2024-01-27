let currentProgress = 0;
let currentDuration = 0;

function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            if (data.isPlaying == true) {
                    console.log(`name: ${data.title} by ${data.artist}\nurl: ${data.url}\nart: ${data.art}`);
                    document.getElementById("player_image").src = data.art;

                    // Update the rest of the elements
                    document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                    document.getElementById("player_link").href = data.url;

                    currentProgress = data.progress;
                    currentDuration = data.duration;
            } else {
                document.getElementById("player_image").src = data.art;
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
