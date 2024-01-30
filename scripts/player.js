let currentProgress = 0;
let currentDuration = 0;

function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            if (data.isPlaying == true) {
                console.log(`name: ${data.name} • ${data.artist}\nurl: ${data.url}\nart: ${data.art}`);

                if (data.art === null) {
                    document.getElementById("player_image").src = "./styles/spong.png";
                } else {
                    document.getElementById("player_image").src = data.art;
                }

                // Update the rest of the elements
                document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;

                currentProgress = data.progress;
                currentDuration = data.duration;
                
                // Update the progress bar
                const progressPercentage = (currentProgress / currentDuration) * 100;
                document.getElementById("player_progress").style.width = progressPercentage + "%";

                // if 100 is reached, call fetchAndDisplayTime() to get the new song
                if (currentProgress >= currentDuration) {
                    fetchAndDisplayTime();
                }
            } else {
                document.getElementById("player_image").src = data.art;
                document.getElementById("player_title").innerHTML = "[LAST PLAYED] " + data.name + " • " + data.artist;
                document.getElementById("player_link").href = data.url;

                // Reset progress when playback stops
                currentProgress = 0;
            }
        });
}

// Fetch and display time immediately and then every 10 seconds
fetchAndDisplayTime();
updateFakeProgressBar();
setInterval(fetchAndDisplayTime, 10000);

// Update fake progress only when playing
function updateFakeProgressBar() {
    if (currentProgress < currentDuration) {
        // each second, add however much the progress bar has progressed
        currentProgress += 1000;
        console.log((currentProgress / currentDuration) * 100);

        // set width of progress bar
        const progressPercentage = (currentProgress / currentDuration) * 100;
        document.getElementById("player_progress").style.width = progressPercentage + "%";
        
        // when progress bar reaches 100%, call fetchAndDisplayTime() to get the new song
        if (currentProgress >= currentDuration) {
            fetchAndDisplayTime();
        }
    }
}

// Update fake progress every second
setInterval(updateFakeProgressBar, 1000);
